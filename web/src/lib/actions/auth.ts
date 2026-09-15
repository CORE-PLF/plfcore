'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { AFFILIATE_COOKIE, attachAttribution } from '@/lib/affiliates'
import { hasStaffRole, requireUser, safeNext } from '@/lib/auth'
import { hashPassword, randomToken, sha256, verifyPassword } from '@/lib/crypto'
import { clientIp } from '@/lib/ip'
import { rateLimit, rateLimitPeek } from '@/lib/ratelimit'
import {
  generateRecoveryCode,
  questionLabel,
  setSecurityQuestions,
  useRecoveryCode,
  verifySecurityAnswers,
} from '@/lib/recovery'
import { createSession, destroySession } from '@/lib/session'

export interface AuthFormState {
  error: string | null
  ok?: boolean
}

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(80),
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(128),
  aceite: z.literal('on', { message: 'É preciso aceitar os termos para criar a conta.' }),
})

export async function registerAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await clientIp()

  // honeypot: campo invisível para humanos — bot que preencher sai com "sucesso" sem conta
  if (String(formData.get('website') ?? '') !== '') redirect('/entrar')

  // valida ANTES de contar: requisição malformada não queima o limite de ninguém
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  if (!(await rateLimit(`register:${ip}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }
  if (!(await rateLimit(`register-day:${ip}`, 20, 24 * 3600_000)))
    return { error: 'Limite de cadastros atingido por hoje. Tente novamente amanhã.' }
  const { name, email, password } = parsed.data

  const exists = await db.user.findUnique({ where: { email } })
  // anti-enumeração: mesma mensagem do login inválido não se aplica aqui — cadastro
  // precisa avisar, mas sem confirmar se há conta: mensagem neutra + fluxo de recuperação
  if (exists) return { error: 'Não foi possível criar a conta com este e-mail. Se ela já é sua, use "Recuperar acesso".' }

  const user = await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  })
  await db.legalAcceptance.create({
    data: { userId: user.id, docType: 'termos+privacidade', version: '2026-08', ip },
  })

  const jar = await cookies()
  const ref = jar.get(AFFILIATE_COOKIE)?.value
  if (ref) await attachAttribution(user.id, ref)

  await audit({ actorUserId: user.id, action: 'user.register', entity: 'user', entityId: user.id, ip })
  await createSession(user.id)
  // conta nova nunca tem perguntas de segurança — leva direto à configuração
  redirect('/painel/seguranca?inicial=1')
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
})

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await clientIp()
  if (!(await rateLimit(`login:${ip}`, 10, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }

  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // trava por conta que só conhece FALHAS: bruteforce distribuído contra um
  // e-mail não escapa pelo limite de IP, e o dono com a senha certa nunca é
  // trancado por login bem-sucedido (o sucesso não incrementa nada)
  if (!(await rateLimitPeek(`login-acc:${parsed.data.email}`, 15)))
    return { error: 'Muitas tentativas nesta conta. Aguarde alguns minutos e tente de novo.' }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } })
  const invalid = { error: 'E-mail ou senha incorretos.' }
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await rateLimit(`login-acc:${parsed.data.email}`, 15, 15 * 60_000)
    if (user) await audit({ action: 'user.login_failed', entity: 'user', entityId: user.id, ip })
    return invalid
  }
  if (user.status !== 'ACTIVE') return { error: 'Conta suspensa. Fale com o suporte.' }

  await audit({ actorUserId: user.id, action: 'user.login', entity: 'user', entityId: user.id, ip })
  await createSession(user.id)
  // volta para onde o login foi exigido (checkout, download) — nunca perde o fluxo.
  // Sem destino pedido, staff cai direto na operação; cliente, no painel dele.
  redirect(
    safeNext(String(formData.get('next') ?? '')) ?? (hasStaffRole(user, 'SUPPORT') ? '/admin' : '/painel'),
  )
}

export async function logoutAction(): Promise<void> {
  await destroySession()
  redirect('/')
}

export async function resetPasswordAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const ip = await clientIp()
  if (!(await rateLimit(`reset-ip:${ip}`, 10, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' }

  const token = String(formData.get('token') ?? '')
  const password = z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.').max(128).safeParse(formData.get('password'))
  if (!password.success) return { error: password.error.issues[0].message }

  const row = await db.emailToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!row || row.purpose !== 'RESET_PASSWORD' || row.usedAt || row.expiresAt < new Date())
    return { error: 'Link inválido ou expirado. Peça um novo em "Recuperar acesso".' }

  await db.$transaction(async (tx) => {
    await tx.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } })
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password.data) } })
    await tx.session.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit({ actorUserId: row.userId, action: 'user.password_reset', entity: 'user', entityId: row.userId }, tx)
  })
  redirect('/entrar?reset=ok')
}

// ===== recuperação sem e-mail (perguntas de segurança + código) =====

export interface RecoveryState {
  error: string | null
  email?: string
  questions?: { slot: number; label: string }[]
  askCode?: boolean
  newCode?: string
  resetUrl?: string
}

const RECOVERY_WINDOW = 30 * 60_000
const TOO_MANY = 'Muitas tentativas. Aguarde 30 minutos e tente de novo.'

async function recoveryLimits(ip: string, email: string, userId?: string): Promise<string | null> {
  if (!(await rateLimit(`recovery-ip:${ip}`, 5, RECOVERY_WINDOW))) return TOO_MANY
  if (!(await rateLimit(`recovery-acc:${userId ?? email}`, 5, RECOVERY_WINDOW))) return TOO_MANY
  if (!(await rateLimit(`recovery-strikes:${email}`, 15, 24 * 3600_000)))
    return 'Conta temporariamente bloqueada para recuperação. Tente novamente mais tarde ou fale com o suporte.'
  return null
}

async function createResetToken(userId: string): Promise<string> {
  const token = randomToken(24)
  // um token vivo por vez: passar de novo pela recuperação mata o anterior
  await db.emailToken.updateMany({
    where: { userId, purpose: 'RESET_PASSWORD', usedAt: null },
    data: { usedAt: new Date() },
  })
  await db.emailToken.create({
    data: {
      tokenHash: sha256(token),
      purpose: 'RESET_PASSWORD',
      userId,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  })
  return token
}

export async function startRecoveryAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const ip = await clientIp()
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'))
  if (!email.success) return { error: 'E-mail inválido.' }

  const user = await db.user.findUnique({
    where: { email: email.data },
    include: { securityQuestions: { orderBy: { slot: 'asc' } } },
  })
  // limites completos JÁ na etapa 1: este endpoint revela as perguntas da conta,
  // então enumeração e coleta de perguntas pagam o mesmo preço das respostas
  const blocked = await recoveryLimits(ip, email.data, user?.id)
  if (blocked) return { error: blocked }
  if (user && user.securityQuestions.length === 2) {
    return {
      error: null,
      email: email.data,
      questions: user.securityQuestions.map((q) => ({ slot: q.slot, label: questionLabel(q.question) })),
    }
  }
  // mensagem neutra: não confirma existência de conta
  return { error: null, email: email.data, askCode: true }
}

export async function answerRecoveryAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const ip = await clientIp()
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'))
  if (!email.success) return { error: 'E-mail inválido.' }

  const user = await db.user.findUnique({ where: { email: email.data } })
  const blocked = await recoveryLimits(ip, email.data, user?.id)
  if (blocked) return { error: blocked }

  const ok = user
    ? await verifySecurityAnswers(user.id, [
        { slot: 1, answer: String(formData.get('resposta1') ?? '') },
        { slot: 2, answer: String(formData.get('resposta2') ?? '') },
      ])
    : false
  if (!ok) {
    if (user)
      await audit({ action: 'user.recovery_questions_failed', entity: 'user', entityId: user.id, ip })
    // mensagem única — nunca dizer qual resposta errou
    return { error: 'Não foi possível verificar as respostas.' }
  }

  await audit({ action: 'user.recovery_questions_ok', entity: 'user', entityId: user!.id, ip })
  const token = await createResetToken(user!.id)
  redirect(`/recuperar/${token}`)
}

export async function recoveryCodeAction(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const ip = await clientIp()
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get('email'))
  if (!email.success) return { error: 'E-mail inválido.' }
  const codigo = String(formData.get('codigo') ?? '').trim()
  if (!codigo) return { error: 'Informe o código de recuperação.' }

  const user = await db.user.findUnique({ where: { email: email.data } })
  const blocked = await recoveryLimits(ip, email.data, user?.id)
  if (blocked) return { error: blocked }

  const userId = user ? await useRecoveryCode(codigo, user.id) : null
  if (!userId)
    return { error: 'Código inválido ou já usado. Confira o código digitado ou fale com o suporte.' }

  const newCode = await generateRecoveryCode(userId)
  await audit({ actorUserId: userId, action: 'user.recovery_code_used', entity: 'user', entityId: userId, ip })
  const token = await createResetToken(userId)
  return { error: null, newCode, resetUrl: `/recuperar/${token}` }
}

export async function setupSecurityAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const user = await requireUser()
  if (!(await rateLimit(`secq:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto.' }

  const existing = await db.securityQuestion.count({ where: { userId: user.id } })
  if (existing > 0) {
    const senha = String(formData.get('senha') ?? '')
    if (!user.passwordHash || !(await verifyPassword(senha, user.passwordHash)))
      return { error: 'Senha atual incorreta. Para trocar as perguntas, confirme sua senha.' }
  }

  const pairs = [
    { question: String(formData.get('pergunta1') ?? ''), answer: String(formData.get('resposta1') ?? '') },
    { question: String(formData.get('pergunta2') ?? ''), answer: String(formData.get('resposta2') ?? '') },
  ]
  try {
    await setSecurityQuestions(user.id, pairs)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível salvar as perguntas. Tente de novo.' }
  }

  await audit({
    actorUserId: user.id,
    action: 'user.security_questions_set',
    entity: 'user',
    entityId: user.id,
    after: { questions: pairs.map((p) => p.question) },
    ip: await clientIp(),
  })
  redirect('/painel/seguranca?ok=perguntas')
}

export interface RecoveryCodeState {
  error: string | null
  code?: string
}

export async function generateRecoveryCodeAction(
  _prev: RecoveryCodeState,
  formData: FormData,
): Promise<RecoveryCodeState> {
  const user = await requireUser()
  if (!(await rateLimit(`reccode:${user.id}`, 5, 60_000)))
    return { error: 'Muitas tentativas. Aguarde um minuto.' }
  if (!user.passwordHash)
    return { error: 'Esta conta não tem senha. Crie uma em "Recuperar acesso" na tela de login antes de gerar o código.' }
  if (!(await verifyPassword(String(formData.get('senha') ?? ''), user.passwordHash)))
    return { error: 'Senha incorreta. Confirme sua senha para gerar o código.' }

  const code = await generateRecoveryCode(user.id)
  await audit({
    actorUserId: user.id,
    action: 'user.recovery_code_generated',
    entity: 'user',
    entityId: user.id,
    ip: await clientIp(),
  })
  return { error: null, code }
}
