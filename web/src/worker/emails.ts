import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { sendMail } from '@/lib/email'
import { formatCents } from '@/lib/money'
import { BRAND } from '@/lib/brand'

// Templates de e-mail transacional — texto simples pt-BR + html mínimo.
// Falta de SMTP não quebra (sendMail vira log). Nunca inclui a chave da licença.

export type EmailTemplate =
  | 'purchase_confirmed'
  | 'credits_added'
  | 'expiry_warning'
  | 'ticket_reply'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function toHtml(text: string): string {
  return `<pre style="font-family:monospace;white-space:pre-wrap;margin:0">${escapeHtml(text)}</pre>`
}

function dataBr(d: Date): string {
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

export async function sendTemplateEmail(payload: Record<string, unknown>): Promise<void> {
  const template = String(payload.template ?? '') as EmailTemplate
  const userId = String(payload.userId ?? '')
  if (!template || !userId) throw new Error('email.send exige template e userId no payload')

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error(`usuário não encontrado: ${userId}`)

  let subject: string
  let text: string

  switch (template) {
    case 'purchase_confirmed': {
      const orderId = String(payload.orderId ?? '')
      const order = orderId
        ? await db.order.findUnique({ where: { id: orderId }, include: { plan: true } })
        : null
      subject = `${BRAND.name} — pagamento confirmado`
      text = [
        `Olá, ${user.name}.`,
        '',
        order
          ? `Pagamento de ${formatCents(order.totalCents)} confirmado — plano ${order.plan.name}.`
          : 'Seu pagamento foi confirmado.',
        `Sua licença está no painel: ${env.APP_URL}/painel/licenca`,
        '',
        'Nunca compartilhe sua chave. Nosso time nunca pede a chave por e-mail.',
      ].join('\n')
      break
    }
    case 'credits_added': {
      const orderId = String(payload.orderId ?? '')
      const order = orderId ? await db.order.findUnique({ where: { id: orderId } }) : null
      subject = `${BRAND.name} — créditos adicionados`
      text = [
        `Olá, ${user.name}.`,
        '',
        order
          ? `Pagamento de ${formatCents(order.totalCents)} confirmado. Os créditos já estão no seu saldo de revenda.`
          : 'Os créditos já estão no seu saldo de revenda.',
        `Confira no painel: ${env.APP_URL}/painel`,
      ].join('\n')
      break
    }
    case 'expiry_warning': {
      const licenseId = String(payload.licenseId ?? '')
      const license = licenseId ? await db.license.findUnique({ where: { id: licenseId } }) : null
      const days = license?.expiresAt
        ? Math.max(1, Math.ceil((license.expiresAt.getTime() - Date.now()) / 86400_000))
        : null
      subject = `${BRAND.name} — sua licença vence em breve`
      text = [
        `Olá, ${user.name}.`,
        '',
        days !== null && license?.expiresAt
          ? `Sua licença vence em ${days} dia${days === 1 ? '' : 's'} (${dataBr(license.expiresAt)}).`
          : 'Sua licença está próxima do vencimento.',
        `Renove pelo painel para não perder o acesso: ${env.APP_URL}/painel/licenca`,
      ].join('\n')
      break
    }
    case 'ticket_reply': {
      const ticketId = String(payload.ticketId ?? '')
      const ticket = ticketId ? await db.supportTicket.findUnique({ where: { id: ticketId } }) : null
      subject = `${BRAND.name} — resposta no seu ticket`
      text = [
        `Olá, ${user.name}.`,
        '',
        ticket
          ? `Seu ticket "${ticket.subject}" recebeu uma resposta do suporte.`
          : 'Seu ticket recebeu uma resposta do suporte.',
        `Responda pelo painel: ${env.APP_URL}/painel/suporte`,
      ].join('\n')
      break
    }
    default:
      throw new Error(`template de e-mail desconhecido: ${String(template)}`)
  }

  await sendMail(user.email, subject, text, toHtml(text))
}
