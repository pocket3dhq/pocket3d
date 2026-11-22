import { clientIp } from './client.ip';

describe('clientIp', () => {
  afterEach(() => delete process.env.TRUSTED_IP_HEADER);

  it('uses nginx, then the socket', () => {
    expect(clientIp({ headers: { 'x-real-ip': ' 2.2.2.2 ' }, ip: '3.3.3.3' })).toBe('2.2.2.2');
    expect(clientIp({ headers: {}, ip: '3.3.3.3' })).toBe('3.3.3.3');
    expect(clientIp({ headers: {}, socket: { remoteAddress: '4.4.4.4' } })).toBe('4.4.4.4');
    expect(clientIp({ headers: {} })).toBe('unknown');
  });

  it("ignores a client's own CF-Connecting-IP unless TRUSTED_IP_HEADER says so", () => {
    const req = { headers: { 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }, ip: '3.3.3.3' };
    expect(clientIp(req)).toBe('2.2.2.2');
    process.env.TRUSTED_IP_HEADER = 'CF-Connecting-IP';
    expect(clientIp(req)).toBe('1.1.1.1');
    // the trusted header missing: back to nginx's
    expect(clientIp({ headers: { 'x-real-ip': '2.2.2.2' } })).toBe('2.2.2.2');
  });
});
