import { describe, expect, test } from 'vitest'
import { qrPath } from '@/lib/qr'

const OTPAUTH = 'otpauth://totp/RESYNC%3Ajogueone%40gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=RESYNC'

// quadrado de 1x1 módulo na posição (col,row), já com a zona de silêncio de 4
const modulo = (col: number, row: number) => `M${col + 4} ${row + 4}h1v1h-1z`

describe('qrPath', () => {
  const { d, size } = qrPath(OTPAUTH)
  const n = size - 8

  test('tem zona de silêncio e tamanho de versão válida', () => {
    expect(n).toBeGreaterThanOrEqual(21)
    expect((n - 21) % 4).toBe(0)
  })

  test('os três marcadores de posição estão nos cantos certos', () => {
    for (const [c, r] of [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ]) {
      expect(d).toContain(modulo(c, r)) // canto externo do marcador: escuro
      expect(d).not.toContain(modulo(c + 1, r + 1)) // anel interno: claro
    }
  })

  test('o módulo escuro fixo prova que linha e coluna não foram trocadas', () => {
    // a norma exige escuro em (linha n-8, coluna 8); o transposto não é fixo
    expect(d).toContain(modulo(8, n - 8))
  })
})
