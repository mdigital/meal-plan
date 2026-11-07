import { appendFileSync } from "node:fs";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Config } from "../config.js";

export type Mail = { to: string; subject: string; text: string; html: string };
export type Attachment = { filename: string; content: Buffer; contentType: string };
export interface Mailer {
  send(mail: Mail): Promise<void>;
  sendWithAttachment(mail: Omit<Mail, "html">, attachment: Attachment): Promise<void>;
}

/** Builds a multipart MIME message (SES needs raw MIME for attachments). */
export function buildMime(from: string, mail: Omit<Mail, "html">, a: Attachment, boundary = `b${Date.now().toString(36)}`): string {
  const b64 = a.content.toString("base64").replace(/.{1,76}/g, "$&\r\n");
  const safeName = a.filename.replace(/[^\w.-]/g, "_");
  return [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${mail.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    mail.text,
    `--${boundary}`,
    `Content-Type: ${a.contentType}; name="${safeName}"`,
    `Content-Disposition: attachment; filename="${safeName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    b64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Records mail in memory. Used by tests. */
export class MemoryMailer implements Mailer {
  sent: Mail[] = [];
  attachments: { mail: Omit<Mail, "html">; attachment: Attachment }[] = [];
  async send(mail: Mail) {
    this.sent.push(mail);
  }
  async sendWithAttachment(mail: Omit<Mail, "html">, attachment: Attachment) {
    this.attachments.push({ mail, attachment });
  }
}

class LogMailer implements Mailer {
  async send(mail: Mail) {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    // Dev and end-to-end tests read sign-in links from this file.
    if (process.env.MAIL_LOG_FILE) appendFileSync(process.env.MAIL_LOG_FILE, `${JSON.stringify({ to: mail.to, text: mail.text })}\n`);
  }
  async sendWithAttachment(mail: Omit<Mail, "html">, a: Attachment) {
    console.log(`[mail] to=${mail.to} subject="${mail.subject}" attachment=${a.filename} (${a.content.length} bytes)`);
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
  async sendWithAttachment(mail: Omit<Mail, "html">, a: Attachment) {
    const raw = buildMime(this.from, mail, a);
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [mail.to] },
        Content: { Raw: { Data: Buffer.from(raw, "utf8") } },
      }),
    );
  }
}

export function createMailer(config: Config): Mailer {
  if (config.email.logLinks) return new LogMailer();
  if (!config.email.sesRegion) {
    console.error("Email is not configured: set SES_REGION and AWS credentials. Sign-in links will not be sent.");
    return {
      async send() {
        throw new Error("Email is not configured");
      },
      async sendWithAttachment() {
        throw new Error("Email is not configured");
      },
    };
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
