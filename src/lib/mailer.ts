import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Config } from "../config.js";

export type Mail = { to: string; subject: string; text: string; html: string };
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Records mail in memory. Used by tests. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
}

class LogMailer implements Mailer {
  async send(mail: Mail) {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}

class SesMailer implements Mailer {
  private client: SESv2Client;
  constructor(
    region: string,
    private from: string,
  ) {
    // Credentials come from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (Fly secrets).
    this.client = new SESv2Client({ region });
  }
  async send(mail: Mail) {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [mail.to] },
        Content: {
          Simple: {
            Subject: { Data: mail.subject, Charset: "UTF-8" },
            Body: { Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}

export function createMailer(config: Config): Mailer {
  if (config.email.logLinks) return new LogMailer();
  if (!config.email.sesRegion) {
    throw new Error("Email is not configured: set SES_REGION (and AWS credentials) or EMAIL_LOG_LINKS=1");
  }
  return new SesMailer(config.email.sesRegion, config.email.from);
}

export function magicLinkMail(to: string, link: string): Mail {
  return {
    to,
    subject: "Your sign-in link for Meals",
    text: `Tap this link to sign in to Meals:\n\n${link}\n\nIt works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
    html: `<p>Tap the button to sign in to Meals.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#2f6b4f;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p><p style="color:#666;font-size:14px">It works once and expires in 15 minutes. If you didn't ask for it, ignore this email.</p>`,
  };
}
