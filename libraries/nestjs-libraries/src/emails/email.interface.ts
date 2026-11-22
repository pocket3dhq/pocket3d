export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

// One per email service (Resend today; nodemailer, SES... could follow)
export interface EmailProvider {
  name: string;
  send(from: string, message: EmailMessage): Promise<void>;
}
