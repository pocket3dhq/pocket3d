import http, { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Readable } from 'stream';
import { checkRemoteUrl, isPublicAddress, openRemote, uploadFromUrl } from './remote.fetch';
import { ASSET_UPLOAD_RULES } from './custom.upload.validation';
import { IUploadProvider } from './upload.interface';

const glb = () => {
  const head = Buffer.alloc(12);
  head.write('glTF', 0, 'latin1');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12, 8);
  return head;
};

// Collects what would have been stored
const memoryStorage = () => {
  const stored: Buffer[] = [];
  const storage: IUploadProvider = {
    async uploadStream(stream: Readable, mimetype: string, ext: string) {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      stored.push(Buffer.concat(chunks));
      return { filename: `k.${ext}`, path: `https://files.test/k.${ext}`, mimetype };
    },
    async removeFile() {},
  };
  return { storage, stored };
};

describe('remote.fetch', () => {
  it('only treats public addresses as public', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '104.16.0.1', '2606:4700::1111']) {
      expect(isPublicAddress(ip)).toBe(true);
    }
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1', // IPv4-mapped loopback
      '::ffff:10.0.0.1',
      'not-an-ip',
    ]) {
      expect(isPublicAddress(ip)).toBe(false);
    }
  });

  it('refuses other schemes, credentials and non-standard ports before any request', () => {
    expect(checkRemoteUrl('https://example.com/a.glb').host).toBe('example.com');
    for (const bad of ['file:///etc/passwd', 'ftp://x.com/a.glb', 'https://user:pw@x.com/a.glb', 'http://x.com:3000/a.glb', 'nope']) {
      expect(() => checkRemoteUrl(bad)).toThrow();
    }
  });

  it('refuses hosts that resolve to private addresses (all records must be public)', async () => {
    const resolve = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ];
    await expect(openRemote('https://mixed.example/a.glb', ASSET_UPLOAD_RULES.file, { resolve })).rejects.toThrow(
      /not a public address/
    );
    await expect(openRemote('http://127.0.0.1/a.glb', ASSET_UPLOAD_RULES.file)).rejects.toThrow(/not a public address/);
    await expect(openRemote('http://[::1]/a.glb', ASSET_UPLOAD_RULES.file)).rejects.toThrow(/not a public address/);
  });

  describe('against a local server (loopback allowed for the test only)', () => {
    let server: Server;
    let port: number;
    const routes: Record<string, (res: any) => void> = {
      '/model.glb': (res) => res.end(glb()),
      '/fake.glb': (res) => res.end('not a model at all'),
      '/redirect': (res) => res.writeHead(302, { Location: '/model.glb' }).end(),
      '/to-metadata': (res) => res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' }).end(),
      '/huge.glb': (res) => res.writeHead(200, { 'Content-Length': String(200 * 1024 * 1024) }).end(),
      '/missing.glb': (res) => res.writeHead(404).end(),
    };

    beforeAll(async () => {
      server = createServer((req, res) => (routes[req.url!] || routes['/missing.glb'])(res));
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise((resolve) => server.close(resolve)));

    // The test server listens on a random port; production only allows 80/443
    const options = () => ({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      allowAddress: (ip: string) => ip === '127.0.0.1',
    });
    // Port checks happen in checkRemoteUrl; point at the server through a
    // fake host on port 80 and pin the connection to the test port
    const at = (path: string) => `http://models.test${path}`;

    beforeAll(() => {
      // route models.test:80 to the test server's port
      const original = http.request;
      jest.spyOn(http, 'request').mockImplementation(((url: any, opts: any, cb: any) => {
        const target = new URL(url.toString());
        target.port = String(port);
        return original.call(http, target, opts, cb);
      }) as any);
    });
    afterAll(() => jest.restoreAllMocks());

    it('downloads a model into storage, through redirects, with its file name', async () => {
      const { storage, stored } = memoryStorage();
      const uploaded = await uploadFromUrl(storage, at('/redirect'), ASSET_UPLOAD_RULES.file, options());
      expect(uploaded).toMatchObject({ path: 'https://files.test/k.glb', size: 12, originalname: 'model.glb' });
      expect(stored[0].equals(glb())).toBe(true);
    });

    it('sniffs the real type: a fake .glb is refused', async () => {
      const { storage, stored } = memoryStorage();
      await expect(uploadFromUrl(storage, at('/fake.glb'), ASSET_UPLOAD_RULES.file, options())).rejects.toThrow(
        /binary glTF/
      );
      expect(stored).toHaveLength(0);
    });

    it('re-checks every redirect target', async () => {
      const { storage } = memoryStorage();
      await expect(uploadFromUrl(storage, at('/to-metadata'), ASSET_UPLOAD_RULES.file, options())).rejects.toThrow(
        /not a public address/
      );
    });

    it('refuses an announced size over the cap, and error statuses', async () => {
      const { storage } = memoryStorage();
      await expect(uploadFromUrl(storage, at('/huge.glb'), ASSET_UPLOAD_RULES.file, options())).rejects.toThrow(/too large/);
      await expect(uploadFromUrl(storage, at('/missing.glb'), ASSET_UPLOAD_RULES.file, options())).rejects.toThrow(/404/);
    });
  });
});
