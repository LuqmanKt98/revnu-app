import "server-only";
// E-mail plumbing. MAIL_MODE=log  → nothing is sent; the outbox row is marked "logged" (development).
//                  MAIL_MODE=resend → sent through Resend from MAIL_FROM (sandbox sender until the client's
//                  domain is verified at the cut-over step; then MAIL_FROM becomes the branded address).
import { Resend } from "resend";

export type Mail = { to: string; subject: string; html: string; text?: string };

export function mailMode(): "log" | "resend" {
  return process.env.MAIL_MODE === "resend" && !!process.env.RESEND_API_KEY ? "resend" : "log";
}

export async function sendMail(mail: Mail): Promise<{ status: "logged" | "sent"; id?: string }> {
  if (mailMode() === "log") {
    console.log(`[mail:log] to=${mail.to} subject=${JSON.stringify(mail.subject)}`);
    return { status: "logged" };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM || "Revnu <onboarding@resend.dev>",
    to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text,
  });
  if (error) throw new Error(error.message);
  return { status: "sent", id: data?.id };
}
