import nodemailer from 'nodemailer'
import { env, smtpConfigured } from './env'

// SMTP não configurado (dev) → e-mail vira log estruturado no console.
// Falha de e-mail nunca derruba a operação que o disparou (fila cuida do retry).

function transport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  })
}

export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!smtpConfigured()) {
    console.log(JSON.stringify({ level: 'info', evt: 'email.skipped_no_smtp', to, subject }))
    return
  }
  await transport().sendMail({ from: env.SMTP_FROM, to, subject, text, html })
}
