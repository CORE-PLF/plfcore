import { describe, expect, test } from 'vitest'
import { applyPercentBps, formatCents } from '@/lib/money'

// Intl usa NBSP (U+00A0) entre "R$" e o valor
const norm = (s: string) => s.replace(new RegExp(String.fromCharCode(0xa0), 'g'), ' ')

describe('formatCents', () => {
  test('formata centavos como BRL pt-BR', () => {
    expect(norm(formatCents(5990))).toBe('R$ 59,90')
    expect(norm(formatCents(0))).toBe('R$ 0,00')
    expect(norm(formatCents(123456))).toBe('R$ 1.234,56')
    expect(norm(formatCents(1))).toBe('R$ 0,01')
  })
})

describe('applyPercentBps', () => {
  test('percentual exato', () => {
    expect(applyPercentBps(10000, 1000)).toBe(1000) // 10% de R$ 100
    expect(applyPercentBps(5990, 2000)).toBe(1198) // 20% de R$ 59,90
  })

  test('arredonda pra cima (a favor do cliente)', () => {
    expect(applyPercentBps(999, 1000)).toBe(100) // 99,9 → 100
    expect(applyPercentBps(1, 1)).toBe(1) // 0,0001 → 1
    expect(applyPercentBps(3333, 3333)).toBe(1111) // 1110,88... → 1111
  })

  test('zero é zero', () => {
    expect(applyPercentBps(0, 1000)).toBe(0)
    expect(applyPercentBps(10000, 0)).toBe(0)
  })
})
