import { randomBytes } from 'node:crypto'
import { db } from './db'
import { hashPassword, sha256, verifyPassword } from './crypto'

// Perguntas fixas: o banco guarda só o code (estável); o label é apresentação.
export const QUESTIONS = [
  { code: 'amigo-infancia', label: 'Qual era o nome do seu melhor amigo de infância?' },
  { code: 'primeiro-animal', label: 'Qual era o nome do seu primeiro animal?' },
  { code: 'bairro', label: 'Em qual bairro você cresceu?' },
  { code: 'apelido', label: 'Qual era seu apelido de infância?' },
  { code: 'primeira-escola', label: 'Qual era o nome da sua primeira escola?' },
  { code: 'jogo-favorito', label: 'Qual é o nome do seu jogo favorito?' },
  { code: 'personagem', label: 'Qual é o nome do personagem que você mais gosta?' },
  { code: 'primeiro-pc', label: 'Qual era a marca do seu primeiro computador ou celular?' },
] as const

export function questionLabel(code: string): string {
  return QUESTIONS.find((q) => q.code === code)?.label ?? code
}

export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export async function setSecurityQuestions(
  userId: string,
  pairs: { question: string; answer: string }[],
): Promise<void> {
  if (pairs.length !== 2) throw new Error('Escolha exatamente 2 perguntas.')
  const codes = pairs.map((p) => p.question)
  if (codes.some((c) => !QUESTIONS.some((q) => q.code === c)))
    throw new Error('Pergunta inválida. Escolha uma da lista.')
  if (codes[0] === codes[1]) throw new Error('Escolha duas perguntas diferentes.')
  const answers = pairs.map((p) => normalizeAnswer(p.answer))
  if (answers.some((a) => a.length < 3))
    throw new Error('Cada resposta precisa de pelo menos 3 caracteres.')

  await db.$transaction(async (tx) => {
    await tx.securityQuestion.deleteMany({ where: { userId } })
    for (let slot = 1; slot <= 2; slot++) {
      await tx.securityQuestion.create({
        data: { userId, slot, question: codes[slot - 1], answerHash: await hashPassword(answers[slot - 1]) },
      })
    }
  })
}

export async function verifySecurityAnswers(
  userId: string,
  answers: { slot: number; answer: string }[],
): Promise<boolean> {
  const questions = await db.securityQuestion.findMany({ where: { userId }, orderBy: { slot: 'asc' } })
  if (questions.length !== 2) return false
  // sempre verifica as duas — sem short-circuit que revele qual falhou
  const results: boolean[] = []
  for (const q of questions) {
    const given = answers.find((a) => a.slot === q.slot)?.answer ?? ''
    results.push(await verifyPassword(normalizeAnswer(given), q.answerHash))
  }
  return results.every(Boolean)
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 32 símbolos, sem 0/O/1/I

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '')
}

export async function generateRecoveryCode(
  userId: string,
  kind: 'ACCOUNT' | 'TOTP' = 'ACCOUNT',
): Promise<string> {
  // 24 bytes (192 bits) de fonte; 32 divide 256 → módulo sem viés
  const bytes = randomBytes(24)
  let body = ''
  for (let i = 0; i < 24; i++) body += CODE_ALPHABET[bytes[i] % 32]
  const code = `BBX-${(body.match(/.{6}/g) as string[]).join('-')}`

  await db.$transaction(async (tx) => {
    await tx.recoveryCode.updateMany({
      where: { userId, kind, usedAt: null },
      data: { usedAt: new Date() },
    })
    await tx.recoveryCode.create({
      data: { userId, kind, codeHash: sha256(normalizeRecoveryCode(code)) },
    })
  })
  return code
}

export async function useRecoveryCode(code: string, userId?: string): Promise<string | null> {
  const codeHash = sha256(normalizeRecoveryCode(code))
  const row = await db.recoveryCode.findUnique({ where: { codeHash } })
  if (!row || row.kind !== 'ACCOUNT' || row.usedAt) return null
  if (userId && row.userId !== userId) return null
  // usedAt: null na cláusula garante uso único mesmo em corrida
  const { count } = await db.recoveryCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  })
  return count === 1 ? row.userId : null
}
