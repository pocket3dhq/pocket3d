import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from './email.interface';
import { EmptyProvider } from './empty.provider';
import { ResendProvider } from './resend.provider';

// With RESEND_API_KEY set, signup needs an emailed activation link and
// "forgot password" works. Without it (a typical self-host) neither exists
@Injectable()
export class EmailService {
  private readonly _logger = new Logger(EmailService.name);
  readonly provider: EmailProvider;

  constructor() {
    this.provider = process.env.RESEND_API_KEY
      ? new ResendProvider(process.env.RESEND_API_KEY)
      : new EmptyProvider();
  }

  hasProvider() {
    return !(this.provider instanceof EmptyProvider);
  }

  private from() {
    const name = process.env.EMAIL_FROM_NAME || 'pocket3d';
    return `${name} <${process.env.EMAIL_FROM_ADDRESS}>`;
  }

  async send(message: EmailMessage) {
    if (!this.hasProvider()) {
      return;
    }
    try {
      await this.provider.send(this.from(), message);
    } catch (err) {
      // Logged, not thrown: the account action itself succeeded, and the
      // person can ask for the email again
      this._logger.error(`Could not send "${message.subject}": ${err}`);
    }
  }
}
