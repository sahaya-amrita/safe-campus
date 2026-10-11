import type { Logger } from 'pino';
import { authSettings, type Config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  readonly name: 'dev' | 'resend';
  send(message: EmailMessage): Promise<void>;
}

export interface DevMailboxEntry extends EmailMessage {
  sentAt: string;
}

/**
 * Local development only: keeps the last 50 messages in memory so a developer
 * can read codes at GET /api/v1/dev/mailbox. Nothing leaves the machine.
 * Configuration rejects this sender in production.
 */
export class DevMailbox implements EmailSender {
  readonly name = 'dev' as const;
  private readonly entries: DevMailboxEntry[] = [];

  constructor(private readonly logger?: Logger) {}

  send(message: EmailMessage): Promise<void> {
    this.entries.unshift({ ...message, sentAt: new Date().toISOString() });
    this.entries.length = Math.min(this.entries.length, 50);
    // The code itself is never logged.
    this.logger?.info(
      { to: message.to },
      'DEV MAILBOX: message stored (read it at GET /api/v1/dev/mailbox)',
    );
    return Promise.resolve();
  }

  messages(): readonly DevMailboxEntry[] {
    return this.entries;
  }
}

/** Sends through the Resend HTTPS API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendSender implements EmailSender {
  readonly name = 'resend' as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email provider responded ${response.status}`);
  }
}

export function createEmailSender(config: Config, logger?: Logger): EmailSender | null {
  const provider = authSettings(config).emailProvider;
  if (provider === 'dev') return new DevMailbox(logger);
  if (provider === 'resend' && config.RESEND_API_KEY && config.EMAIL_FROM)
    return new ResendSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  return null;
}
