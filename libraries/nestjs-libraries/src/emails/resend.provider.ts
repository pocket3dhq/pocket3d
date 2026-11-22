import { EmailMessage, EmailProvider } from './email.interface';

// https://resend.com/docs/api-reference/emails/send-email, called with fetch
// so there's no SDK dependency
export class ResendProvider implements EmailProvider {
  name = 'resend';

  constructor(
    private apiKey: string,
    private endpoint = process.env.RESEND_API_URL || 'https://api.resend.com/emails'
  ) {}

  async send(from: string, message: EmailMessage) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  }
}
