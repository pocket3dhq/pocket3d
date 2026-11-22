import { EmailProvider } from './email.interface';

// No email service configured: accounts are active at once and there is no
// password reset, so nothing is ever sent
export class EmptyProvider implements EmailProvider {
  name = 'none';
  async send() {}
}
