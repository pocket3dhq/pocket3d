import { EmailService } from './email.service';
import { ResendProvider } from './resend.provider';

describe('EmailService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('is a no-op without RESEND_API_KEY', async () => {
    delete process.env.RESEND_API_KEY;
    const service = new EmailService();
    expect(service.hasProvider()).toBe(false);
    const fetchSpy = jest.spyOn(global, 'fetch');
    await service.send({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends through Resend with the configured sender', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM_ADDRESS = 'hello@pocket3d.co';
    process.env.EMAIL_FROM_NAME = 'pocket3d';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new EmailService();
    expect(service.hasProvider()).toBe(true);
    await service.send({ to: 'a@b.co', subject: 'Hi', html: '<p>x</p>' });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as any).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'pocket3d <hello@pocket3d.co>',
      to: ['a@b.co'],
      subject: 'Hi',
      html: '<p>x</p>',
    });
  });

  it("logs a failed send instead of failing the account action", async () => {
    process.env.RESEND_API_KEY = 're_test';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad sender', { status: 422 }));
    await expect(new EmailService().send({ to: 'a@b.co', subject: 's', html: 'h' })).resolves.toBeUndefined();
  });

  it('the provider throws on a non-2xx answer', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    await expect(new ResendProvider('k').send('a <a@b.co>', { to: 'x@y.co', subject: 's', html: 'h' })).rejects.toThrow(/401/);
  });
});
