import { describe, expect, test } from 'vitest'
import { hostDeProducao } from '../scripts/seed-staging'

// O que importa aqui: o seed de staging RECUSA um alvo de produção. O caminho
// feliz (semear de verdade) não é testado — ele escreve no banco.

describe('seed de staging — portão de produção', () => {
  test('DATABASE_URL apontando para produção é recusada', () => {
    expect(
      hostDeProducao('mysql://user:senha@core.proleague.com.br:3306/resync', 'http://localhost:3000'),
    ).toBe('core.proleague.com.br')
  })

  test('APP_URL de produção é recusada mesmo com banco inofensivo', () => {
    expect(hostDeProducao('mysql://root:dev@localhost:3307/resync', 'https://core.proleague.com.br')).toBe(
      'core.proleague.com.br',
    )
  })

  test('domínio raiz também conta como produção', () => {
    expect(hostDeProducao(undefined, 'https://proleague.com.br/admin')).toBe('proleague.com.br')
  })

  test('staging passa — o subdomínio não pode ser confundido com produção', () => {
    expect(
      hostDeProducao(
        'mysql://root:senha@mysql-staging:3306/resync_staging',
        'https://staging.core.proleague.com.br',
      ),
    ).toBeNull()
  })

  test('dev passa', () => {
    expect(hostDeProducao('mysql://root:dev@localhost:3307/resync', 'http://localhost:3000')).toBeNull()
  })
})
