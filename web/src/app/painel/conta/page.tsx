import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { discordConfigured } from '@/lib/env'
import {
  desvincularDiscordAction,
  salvarPreferenciasAction,
  solicitarExclusaoAction,
} from '@/lib/actions/painel'
import { Chamfer, Kicker, StatusTag } from '@/components/ui'
import { firstParam, type SearchParams } from '../helpers'
import { ConfirmSubmit } from '../confirm-submit'

const OK_MSG: Record<string, string> = {
  preferencias: '✓ Preferências salvas.',
  'discord-desvinculado': '✓ Discord desvinculado.',
}

const ERRO_MSG: Record<string, string> = {
  'discord-em-uso': 'Esta conta do Discord já está vinculada a outro usuário.',
}

export default async function ContaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const sp = await searchParams
  const ok = firstParam(sp.ok)
  const erroParam = firstParam(sp.erro)
  const discordParam = firstParam(sp.discord)
  const erro = erroParam ? (ERRO_MSG[erroParam] ?? erroParam) : undefined

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">CONTA</h1>
      </header>

      {ok && OK_MSG[ok] && (
        <Chamfer cut={6} flat className="mb-4 px-4 py-3">
          <p className="text-sm text-ink-1">{OK_MSG[ok]}</p>
        </Chamfer>
      )}
      {discordParam === 'vinculado' && (
        <Chamfer cut={6} flat className="mb-4 px-4 py-3">
          <p className="text-sm text-ink-1">✓ Discord vinculado.</p>
        </Chamfer>
      )}
      {erro && (
        <Chamfer cut={6} flat className="mb-4 px-4 py-3" role="alert">
          <p className="text-sm" style={{ color: 'var(--color-signal)' }}>
            {erro}
          </p>
        </Chamfer>
      )}

      <Chamfer cut={8} className="p-6">
        <Kicker className="mb-4">DADOS</Kicker>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="type-kicker mb-1">NOME</dt>
            <dd className="text-ink-1">{user.name}</dd>
          </div>
          <div>
            <dt className="type-kicker mb-1">E-MAIL</dt>
            <dd className="text-ink-1">
              <span className="type-mono text-sm">{user.email}</span>
            </dd>
          </div>
          <div>
            <dt className="type-kicker mb-1">PAÍS</dt>
            <dd className="text-ink-1">{user.country ?? 'NÃO INFORMADO'}</dd>
          </div>
        </dl>
      </Chamfer>

      <Chamfer cut={8} className="mt-6 p-6">
        <Kicker className="mb-4">DISCORD</Kicker>
        {user.discordId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-ink-1">
                <span className="type-mono">{user.discordUsername ?? user.discordId}</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                Vinculado — usado para avisos por DM quando o recurso estiver ativo. Sua chave fica
                sempre no painel.
              </p>
            </div>
            <form action={desvincularDiscordAction}>
              <ConfirmSubmit message="Desvincular o Discord desta conta?">
                DESVINCULAR
              </ConfirmSubmit>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">Nenhuma conta do Discord vinculada.</p>
            {discordConfigured() ? (
              <a href="/api/auth/discord?link=1" className="btn btn--ghost btn--sm chamfer">
                VINCULAR
              </a>
            ) : (
              <p className="type-mono text-xs text-ink-3">INDISPONÍVEL NESTE AMBIENTE</p>
            )}
          </div>
        )}
      </Chamfer>

      <Chamfer cut={8} className="mt-6 p-6">
        <Kicker className="mb-4">PREFERÊNCIAS</Kicker>
        <form action={salvarPreferenciasAction} className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <input
              type="checkbox"
              name="notifyOptIn"
              defaultChecked={user.notifyOptIn}
              className="h-4 w-4 accent-[var(--color-signal)]"
            />
            Receber avisos de vencimento e novas versões por DM do Discord, quando o vínculo
            estiver ativo.
          </label>
          <button type="submit" className="btn btn--ghost btn--sm chamfer">
            SALVAR
          </button>
        </form>
      </Chamfer>

      <Chamfer cut={8} className="mt-6 p-6">
        <Kicker className="mb-4">MEUS DADOS</Kicker>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            Baixe uma cópia dos seus dados (perfil, pedidos e licenças) em JSON.
          </p>
          <a href="/painel/conta/exportar" className="btn btn--ghost btn--sm chamfer">
            EXPORTAR MEUS DADOS
          </a>
        </div>
      </Chamfer>

      <section className="mt-6">
        <div className="hazard px-4 py-1.5">
          <p className="type-kicker" style={{ color: 'var(--color-signal)' }}>
            ZONA DESTRUTIVA
          </p>
        </div>
        <Chamfer cut={8} flat className="p-6">
          <p className="text-sm text-ink-2">
            Solicitar a exclusão definitiva da conta e dos dados pessoais (LGPD). Abrimos um ticket de
            privacidade e o processo é conduzido pelo suporte — licenças ativas deixam de funcionar.
          </p>
          <form action={solicitarExclusaoAction} className="mt-4">
            <ConfirmSubmit message="Solicitar a exclusão da conta? Um ticket de privacidade será aberto e o suporte conduzirá o processo. Licenças ativas deixarão de funcionar ao concluir.">
              SOLICITAR EXCLUSÃO DA CONTA
            </ConfirmSubmit>
          </form>
        </Chamfer>
      </section>
    </div>
  )
}
