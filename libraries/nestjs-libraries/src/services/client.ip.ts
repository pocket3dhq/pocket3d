// Who is calling, for rate limits only (never for permissions).
// nginx (in the image, the only direct peer) always sets X-Real-IP to the
// address that connected to it, so by default that is the client. Behind a
// proxy that sets its own header, TRUSTED_IP_HEADER names it (pocket3d.co:
// cf-connecting-ip, set by Cloudflare). Only set it when nothing else can reach
// nginx: a client could otherwise send the header itself and dodge the per-IP
// limits (the per-email and per-account limits still hold)
export function clientIp(req: { headers: Record<string, any>; ip?: string; socket?: { remoteAddress?: string } }) {
  const header = (name: string) => {
    const value = req.headers?.[name];
    return (Array.isArray(value) ? value[0] : value)?.toString().trim() || undefined;
  };
  const trusted = (process.env.TRUSTED_IP_HEADER || '').trim().toLowerCase();
  return (
    (trusted && header(trusted)) || header('x-real-ip') || req.ip || req.socket?.remoteAddress || 'unknown'
  );
}
