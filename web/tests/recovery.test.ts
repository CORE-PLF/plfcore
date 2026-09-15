import { describe, expect, test } from 'vitest'
import { db } from '@/lib/db'
import {
  generateRecoveryCode,
  normalizeAnswer,
  setSecurityQuestions,
  useRecoveryCode,
  verifySecurityAnswers,
} from '@/lib/recovery'
import { createUser } from './helpers'

describe('normalizeAnswer', () => {
  test('remove acentos, baixa a caixa e colapsa espaços', () => {
    expect(normalizeAnswer('  JoÃo   da  SILVA ')).toBe('joao da silva')
    expect(normalizeAnswer('Coração')).toBe('coracao')
    expect(normalizeAnswer('ÊXITO  TOTAL')).toBe('exito total')
  })
})

describe('setSecurityQuestions', () => {
  test('guarda hash scrypt com salt próprio — nunca a resposta em claro', async () => {
    const user = await createUser('secq-hash')
    await setSecurityQuestions(user.id, [
      { question: 'bairro', answer: 'Jardim América' },
      { question: 'apelido', answer: 'Zezinho' },
    ])
    const rows = await db.securityQuestion.findMany({
      where: { userId: user.id },
      orderBy: { slot: 'asc' },
    })
    expect(rows.map((r) => r.slot)).toEqual([1, 2])
    for (const row of rows) expect(row.answerHash).toMatch(/^scrypt:/)
    expect(rows[0].answerHash).not.toContain('jardim america')
    expect(rows[0].answerHash).not.toContain('Jardim América')
    expect(rows[1].answerHash).not.toContain('zezinho')
  })

  test('rejeita perguntas iguais', async () => {
    const user = await createUser('secq-dup')
    await expect(
      setSecurityQuestions(user.id, [
        { question: 'bairro', answer: 'Centro Norte' },
        { question: 'bairro', answer: 'Outra resposta' },
      ]),
    ).rejects.toThrow('duas perguntas diferentes')
  })

  test('rejeita resposta com menos de 3 caracteres após normalizar', async () => {
    const user = await createUser('secq-min')
    await expect(
      setSecurityQuestions(user.id, [
        { question: 'bairro', answer: '  ãO ' }, // normaliza para "ao" (2 chars)
        { question: 'apelido', answer: 'Zezinho' },
      ]),
    ).rejects.toThrow('pelo menos 3 caracteres')
  })

  test('substitui as perguntas anteriores', async () => {
    const user = await createUser('secq-troca')
    await setSecurityQuestions(user.id, [
      { question: 'bairro', answer: 'Centro Sul' },
      { question: 'apelido', answer: 'Zezinho' },
    ])
    await setSecurityQuestions(user.id, [
      { question: 'jogo-favorito', answer: 'Xadrez online' },
      { question: 'primeiro-pc', answer: 'Positivo' },
    ])
    const rows = await db.securityQuestion.findMany({
      where: { userId: user.id },
      orderBy: { slot: 'asc' },
    })
    expect(rows.map((r) => r.question)).toEqual(['jogo-favorito', 'primeiro-pc'])
  })
})

describe('verifySecurityAnswers', () => {
  test('aceita variação de caixa, acento e espaço; exige as DUAS corretas', async () => {
    const user = await createUser('secq-verify')
    await setSecurityQuestions(user.id, [
      { question: 'jogo-favorito', answer: 'Ação e Estratégia' },
      { question: 'primeiro-pc', answer: 'Positivo' },
    ])
    expect(
      await verifySecurityAnswers(user.id, [
        { slot: 1, answer: '  ACAO   e  estrategia ' },
        { slot: 2, answer: 'POSITIVO' },
      ]),
    ).toBe(true)
    expect(
      await verifySecurityAnswers(user.id, [
        { slot: 1, answer: 'acao e estrategia' },
        { slot: 2, answer: 'errada' },
      ]),
    ).toBe(false)
    expect(
      await verifySecurityAnswers(user.id, [
        { slot: 1, answer: 'errada' },
        { slot: 2, answer: 'positivo' },
      ]),
    ).toBe(false)
  })

  test('usuário sem perguntas nunca verifica', async () => {
    const user = await createUser('secq-none')
    expect(
      await verifySecurityAnswers(user.id, [
        { slot: 1, answer: 'qualquer' },
        { slot: 2, answer: 'coisa' },
      ]),
    ).toBe(false)
  })
})

describe('código de recuperação', () => {
  test('formato BBX, uso único, aceita minúsculas e sem hífens', async () => {
    const user = await createUser('reccode')
    const code = await generateRecoveryCode(user.id)
    expect(code).toMatch(/^BBX(-[A-HJ-NP-Z2-9]{6}){4}$/)

    const row = await db.recoveryCode.findFirst({ where: { userId: user.id, usedAt: null } })
    expect(row?.codeHash).not.toContain(code.replace(/-/g, ''))

    const first = await useRecoveryCode(code.toLowerCase().replace(/-/g, ''), user.id)
    expect(first).toBe(user.id)
    // segunda tentativa: já usado
    expect(await useRecoveryCode(code, user.id)).toBeNull()
  })

  test('regenerar invalida o código anterior', async () => {
    const user = await createUser('reccode-regen')
    const antigo = await generateRecoveryCode(user.id)
    const novo = await generateRecoveryCode(user.id)
    expect(await useRecoveryCode(antigo, user.id)).toBeNull()
    expect(await useRecoveryCode(novo, user.id)).toBe(user.id)
  })

  test('código de um usuário não vale para outro (e não é consumido na tentativa)', async () => {
    const a = await createUser('reccode-a')
    const b = await createUser('reccode-b')
    const code = await generateRecoveryCode(a.id)
    expect(await useRecoveryCode(code, b.id)).toBeNull()
    expect(await useRecoveryCode(code, a.id)).toBe(a.id)
  })
})
