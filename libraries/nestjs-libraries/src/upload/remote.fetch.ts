import { BadRequestException } from '@nestjs/common';
import { lookup as dnsLookup } from 'dns/promises';
import http, { IncomingMessage } from 'http';
import https from 'https';
import { BlockList, isIP } from 'net';
import { basename } from 'path';
import { IUploadProvider } from './upload.interface';
import { UploadRule, uploadStreamToStorage } from './custom.upload.validation';

// Downloads a model (or cover) someone points us at (MCP publish_from_url,
// POST /public/v1/assets/from-url) straight into storage. The server makes
// this request, so it must never reach anything private: only http(s) on
// ports 80/443, every resolved address must be public, the connection is
// pinned to the address that was checked (no DNS rebinding in between), and
// each redirect goes through the same checks. The bytes then go through
// uploadStreamToStorage like an upload: sniffed type, size cap mid-stream.

const MAX_REDIRECTS = 3;
const IDLE_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 5 * 60_000;
const ALLOWED_PORTS = new Set(['', '80', '443']);

// Two lists: Node checks IPv4 addresses against IPv6 rules too (as
// ::ffff:a.b.c.d), so the IPv4-mapped rule would block every IPv4 address
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata (169.254.169.254)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  blocked4.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::ffff:0:0', 96], // IPv4-mapped: the dotted form is checked as IPv4 below, any other form is refused
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
] as const) {
  blocked6.addSubnet(net, prefix, 'ipv6');
}

// True when the server may connect to this address
export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    return !blocked4.check(address, 'ipv4');
  }
  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) {
      return isPublicAddress(mapped[1]);
    }
    return !blocked6.check(address, 'ipv6');
  }
  return false;
}

// The URL itself, before any DNS: scheme, credentials, port
export function checkRemoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException(`Not a valid URL: ${raw.slice(0, 200)}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Only http(s) URLs can be fetched.');
  }
  if (url.username || url.password) {
    throw new BadRequestException('URLs with credentials are not allowed.');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new BadRequestException('Only the standard ports (80, 443) can be fetched.');
  }
  return url;
}

export interface RemoteFetchOptions {
  // tests swap these; production uses DNS and isPublicAddress
  resolve?: (hostname: string) => Promise<{ address: string; family: number }[]>;
  allowAddress?: (address: string) => boolean;
  userAgent?: string;
}

const defaultResolve = (hostname: string) => dnsLookup(hostname, { all: true, verbatim: true });

// Resolves the host and refuses it unless every address is public (a host
// with one public and one private record could be steered to the private one)
async function pinnedAddress(url: URL, options: RemoteFetchOptions) {
  const allow = options.allowAddress || isPublicAddress;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  if (isIP(hostname)) {
    addresses = [{ address: hostname, family: isIP(hostname) }];
  } else {
    try {
      addresses = await (options.resolve || defaultResolve)(hostname);
    } catch {
      throw new BadRequestException(`Could not resolve ${hostname}.`);
    }
  }
  if (!addresses.length || addresses.some((a) => !allow(a.address))) {
    throw new BadRequestException(`${hostname} is not a public address; only public URLs can be fetched.`);
  }
  return addresses[0];
}

function requestOnce(url: URL, pinned: { address: string; family: number }, options: RemoteFetchOptions, signal: AbortSignal) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        signal,
        headers: { 'User-Agent': options.userAgent || 'pocket3d', Accept: '*/*' },
        // connect to the address that was checked, whatever DNS says now
        lookup: ((_hostname: string, lookupOptions: { all?: boolean }, callback: (...args: unknown[]) => void) => {
          if (lookupOptions?.all) {
            callback(null, [{ address: pinned.address, family: pinned.family }]);
          } else {
            callback(null, pinned.address, pinned.family);
          }
        }) as never,
      },
      resolve
    );
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}

const fileNameOf = (url: URL) => {
  const name = basename(url.pathname);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};

// Opens the URL (following up to 3 redirects) and returns the response body
export async function openRemote(raw: string, rule: UploadRule, options: RemoteFetchOptions = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  deadline.unref?.();
  let url = checkRemoteUrl(raw);

  try {
    for (let hop = 0; ; hop += 1) {
      const pinned = await pinnedAddress(url, options);
      let response: IncomingMessage;
      try {
        response = await requestOnce(url, pinned, options, controller.signal);
      } catch (err) {
        throw new BadRequestException(`Could not download ${url.host}: ${(err as Error).message}`);
      }

      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (hop >= MAX_REDIRECTS) {
          throw new BadRequestException('Too many redirects.');
        }
        url = checkRemoteUrl(new URL(response.headers.location, url).toString());
        continue;
      }
      if (status !== 200) {
        response.resume();
        throw new BadRequestException(`${url.host} answered ${status} for the ${rule.label.toLowerCase()}.`);
      }
      const length = Number(response.headers['content-length']);
      if (Number.isFinite(length) && length > rule.maxSize) {
        response.destroy();
        throw new BadRequestException(
          `${rule.label} is too large (max ${Math.round(rule.maxSize / (1024 * 1024))} MB).`
        );
      }
      response.on('close', () => clearTimeout(deadline));
      return { stream: response, fileName: fileNameOf(url) };
    }
  } catch (err) {
    clearTimeout(deadline);
    throw err;
  }
}

// Download → sniff → cap → storage. Same result shape as a multer upload
export async function uploadFromUrl(storage: IUploadProvider, url: string, rule: UploadRule, options?: RemoteFetchOptions) {
  const { stream, fileName } = await openRemote(url, rule, options);
  try {
    const uploaded = await uploadStreamToStorage(storage, stream, rule);
    return { ...uploaded, originalname: fileName };
  } catch (err) {
    stream.destroy();
    throw err;
  }
}
