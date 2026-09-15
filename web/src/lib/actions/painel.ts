'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { requireUser } from '@/lib/auth'
import { decrypt, hashPassword, sha256, verifyPassword } from '@/lib/crypto'
import { clientIp } from '@/lib/ip'
import { rateLimit } from '@/lib/ratelimit'

// mesmo nome usado em @/lib/session (a lib não exporta a constante)
const SESSION_COOKIE = 'bbx_session'

// chaves de licença nunca ficam em claro no corpo de tickets
function maskKeys(text: string): string {
  return text.replace(/PLF-[A-Z0-9-]+/gi, 'PLF-****')
}

function backWithError(path: string, message: string): never {
  redirect(`${path}?erro=${encodeURIComponent(message)}`)
}

// ===== licença =====

export interface RevealState {
  key: string | null
  error: string | null
}

export async function revelarChaveAction(_prev: RevealState, formData: FormData): Promise<RevealState> {
  const user = await requireUser()
  if (!(await rateLimit(`key_view:${user.id}`, 10, 60_000)))
    return { key: null, error: 'Muitas tentativas. Aguarde um minuto.' }

  const licenseId = String(formData.get('licenseId') ?? '')
  const license = await db.license.findUnique({ where: { id: licenseId } })
  if (!license || license.userId !== user.id)
    return { key: null, error: 'Licença não encontrada.' }

  await audit({
    actorUserId: user.id,
    action: 'license.key_viewed',
    entity: 'license',
    entityId: license.id,
    ip: await clientIp(),
  })
  return { key: decrypt(license.keyCiphertext), error: null }
}

// dispositivos: cliente NÃO desvincula — troca de instalação = nova licença;
// exceção só via suporte/admin.

// ===== notificações =====

export async function marcarLidaAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const id = String(formData.get('id') ?? '')
  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  revalidatePath('/painel', 'layout')
}

export async function marcarTodasLidasAction(): Promise<void> {
  const user = await requireUser()
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  })
  revalidatePath('/painel', 'layout')
}

// ===== suporte =====

const ticketSchema = z.object({
  categoria: z.enum(['duvida', 'tecnico', 'pagamento', 'licenca', 'privacidade', 'outro'], {
    message: 'Escolha uma categoria.',
  }),
  prioridade: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'], { message: 'Escolha uma prioridade.' }),
  assunto: z.string().trim().min(3, 'O assunto precisa de pelo menos 3 caracteres.').max(120),
  mensagem: z.string().trim().min(10, 'Descreva o caso com pelo menos 10 caracteres.').max(5000),
})

export async function criarTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  if (!(await rateLimit(`ticket:${user.id}`, 5, 60_000)))
    backWithError('/painel/suporte/novo', 'Muitos tickets em sequência. Aguarde um minuto.')

  const parsed = ticketSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) backWithError('/painel/suporte/novo', parsed.error.issues[0].message)

  const ticket = await db.supportTicket.create({
    data: {
      userId: user.id,
      subject: maskKeys(parsed.data.assunto),
      category: parsed.data.categoria,
      priority: parsed.data.prioridade,
      messages: {
        create: { authorUserId: user.id, isStaff: false, body: maskKeys(parsed.data.mensagem) },
      },
    },
  })
  redirect(`/painel/suporte/${ticket.id}`)
}

export async function responderTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const ticketId = String(formData.get('ticketId') ?? '')
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket || ticket.userId !== user.id) redirect('/painel/suporte')

  const body = z
    .string()
    .trim()
    .min(2, 'Escreva uma mensagem antes de enviar.')
    .max(5000, 'Mensagem longa demais (máximo 5000 caracteres).')
    .safeParse(formData.get('mensagem'))
  if (!body.success) backWithError(`/painel/suporte/${ticketId}`, body.error.issues[0].message)
  if (ticket.status === 'CLOSED')
    backWithError(`/painel/suporte/${ticketId}`, 'Ticket fechado. Abra um novo se ainda precisar de ajuda.')

  await db.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: 'AWAITING_SUPPORT',
      messages: { create: { authorUserId: user.id, isStaff: false, body: maskKeys(body.data) } },
    },
  })
  revalidatePath(`/painel/suporte/${ticketId}`)
  redirect(`/painel/suporte/${ticketId}`)
}

export async function fecharTicketAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  const ticketId = String(formData.get('ticketId') ?? '')
  const ticket = await db.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket || ticket.userId !== user.id) redirect('/painel/suporte')
  if (ticket.status !== 'CLOSED') {
    await db.supportTicket.update({ where: { id: ticketId }, data: { status: 'CLOSED' } })
  }
  revalidatePath(`/painel/suporte/${ticketId}`)
  redirect(`/painel/suporte/${ticketId}`)
}

// ===== conta =====

export async function salvarPreferenciasAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  await db.user.update({
    where: { id: user.id },
    data: { notifyOptIn: formData.get('notifyOptIn') === 'on' },
  })
  revalidatePath('/painel/conta')
  redirect('/painel/conta?ok=preferencias')
}

export async function desvincularDiscordAction(): Promise<void> {
  const user = await requireUser()
  if (!user.discordId) redirect('/painel/conta')
  // sem senha, o Discord é o único meio de acesso — desvincular trancaria a conta
  if (!user.passwordHash)
    backWithError(
      '/painel/conta',
      'Defina uma senha antes de desvincular o Discord — hoje ele é seu único meio de acesso. Use "Recuperar acesso" na tela de login.',
    )

  const ip = await clientIp()
  await db.$transaction(async (tx) => {
    await tx.oauthAccount.deleteMany({ where: { userId: user.id, provider: 'discord' } })
    await tx.user.update({
      where: { id: user.id },
      data: { discordId: null, discordUsername: null },
    })
    await audit(
      {
        actorUserId: user.id,
        action: 'user.discord_unlink',
        entity: 'user',
        entityId: user.id,
        before: { discordId: user.discordId, discordUsername: user.discordUsername },
        ip,
      },
      tx,
    )
  })
  revalidatePath('/painel/conta')
  redirect('/painel/conta?ok=discord-desvinculado')
}

export async function solicitarExclusaoAction(): Promise<void> {
  const user = await requireUser()

  // pedido já em andamento → leva direto ao ticket, sem duplicar
  const existing = await db.supportTicket.findFirst({
    where: {
      userId: user.id,
      category: 'privacidade',
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      subject: { contains: 'exclusão' },
    },
  })
  if (existing) redirect(`/painel/suporte/${existing.id}`)

  const ip = await clientIp()
  const ticket = await db.$transaction(async (tx) => {
    const t = await tx.supportTicket.create({
      data: {
        userId: user.id,
        category: 'privacidade',
        priority: 'HIGH',
        subject: 'Solicitação de exclusão de conta (LGPD)',
        messages: {
          create: {
            authorUserId: user.id,
            isStaff: false,
            body:
              'Solicito a exclusão definitiva da minha conta e dos meus dados pessoais, conforme a LGPD (Lei 13.709/2018). ' +
              'Estou ciente de que licenças ativas deixarão de funcionar e de que registros exigidos por lei (fiscais e de pagamento) podem ser mantidos pelo prazo legal.',
          },
        },
      },
    })
    await audit(
      { actorUserId: user.id, action: 'user.deletion_requested', entity: 'user', entityId: user.id, ip },
      tx,
    )
    return t
  })
  redirect(`/painel/suporte/${ticket.id}`)
}

// ===== segurança =====

export async function encerrarOutrasSessoesAction(): Promise<void> {
  const user = await requireUser()
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (!token) redirect('/entrar')

  const { count } = await db.session.updateMany({
    where: { userId: user.id, revokedAt: null, id: { not: sha256(token) } },
    data: { revokedAt: new Date() },
  })
  await audit({
    actorUserId: user.id,
    action: 'user.sessions_revoked',
    entity: 'user',
    entityId: user.id,
    after: { encerradas: count },
    ip: await clientIp(),
  })
  revalidatePath('/painel/seguranca')
  redirect(`/painel/seguranca?ok=sessoes&n=${count}`)
}

const senhaSchema = z.object({
  atual: z.string().min(1, 'Informe a senha atual.'),
  nova: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres.').max(128),
})

export async function trocarSenhaAction(formData: FormData): Promise<void> {
  const user = await requireUser()
  if (!(await rateLimit(`pwd:${user.id}`, 5, 60_000)))
    backWithError('/painel/seguranca', 'Muitas tentativas. Aguarde um minuto.')
  if (!user.passwordHash)
    backWithError('/painel/seguranca', 'Esta conta não tem senha. Use "Recuperar acesso" na tela de login para criar uma.')

  const parsed = senhaSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) backWithError('/painel/seguranca', parsed.error.issues[0].message)

  const ip = await clientIp()
  if (!(await verifyPassword(parsed.data.atual, user.passwordHash))) {
    await audit({
      actorUserId: user.id,
      action: 'user.password_change_failed',
      entity: 'user',
      entityId: user.id,
      ip,
    })
    backWithError('/painel/seguranca', 'Senha atual incorreta.')
  }

  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(parsed.data.nova) },
    })
    // troca de senha derruba as outras sessões; a atual continua
    await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null, ...(token ? { id: { not: sha256(token) } } : {}) },
      data: { revokedAt: new Date() },
    })
    await audit(
      { actorUserId: user.id, action: 'user.password_change', entity: 'user', entityId: user.id, ip },
      tx,
    )
  })
  revalidatePath('/painel/seguranca')
  redirect('/painel/seguranca?ok=senha')
}
