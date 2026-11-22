import { activationEmail, resetEmail } from './email.templates';

describe('email templates', () => {
  it('put the link in and escape it', () => {
    const email = activationEmail('https://pocket3d.co/auth/activate/abc"><script>');
    expect(email.subject).toMatch(/Activate/);
    expect(email.html).toContain('https://pocket3d.co/auth/activate/abc&quot;&gt;&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(resetEmail('https://x/auth/reset/t').html).toContain('https://x/auth/reset/t');
  });
});
