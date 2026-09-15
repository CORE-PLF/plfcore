// Dinheiro SEMPRE em centavos inteiros. Formatação só na borda da UI.

export function formatCents(cents: number, currency = 'BRL', locale = 'pt-BR'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
}

// desconto percentual em basis points (1000 = 10%), arredondando a favor do cliente
export function applyPercentBps(amountCents: number, bps: number): number {
  return Math.ceil((amountCents * bps) / 10000)
}
