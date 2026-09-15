import { requireUser } from '@/lib/auth'
import { discordConfigured } from '@/lib/env'
import {
  desvincularDiscordAction,
  salvarPreferenciasAction,
  solicitarExclusaoAction,
} from '@/lib/actions/painel'
import { Kicker, Notice, Surface, SurfaceHead } from '@/components/ui'
import { firstParam, type SearchParams } from '../helpers'
import { ConfirmSubmit } from '../confirm-submit'

const OK_MSG: Record<string, string> = {
  preferencias: 'Preferências salvas.',
  'discord-desvinculado': 'Discord desvinculado.',
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
        <h1 className="type-display text-3xl">Conta</h1>
      </header>

      {ok && OK_MSG[ok] && (
        <Notice tone="ok" className="mb-4">
          <p className="text-ink-1">{OK_MSG[ok]}</p>
        </Notice>
      )}
      {discordParam === 'vinculado' && (
        <Notice tone="ok" className="mb-4">
          <p className="text-ink-1">Discord vinculado.</p>
        </Notice>
      )}
      {erro && (
        <Notice tone="danger" title="Erro" className="mb-4" role="alert">
          <p>{erro}</p>
        </Notice>
      )}

      <Surface>
        <SurfaceHead>Dados</SurfaceHead>
        <dl className="p-3">
          <div className="datarow">
            <dt>Nome</dt>
            <dd className="normal-case">{user.name}</dd>
          </div>
          <div className="datarow">
            <dt>E-mail</dt>
            <dd className="normal-case">{user.email}</dd>
          </div>
          <div className="datarow">
            <dt>País</dt>
            <dd>{user.country ?? 'NÃO INFORMADO'}</dd>
          </div>
        </dl>
      </Surface>

      <Surface className="mt-6">
        <SurfaceHead>Discord</SurfaceHead>
        <div className="p-5">
          {user.discordId ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-ink-1">{user.discordUsername ?? user.discordId}</p>
                <p className="mt-1 text-xs text-ink-3">
                  Vinculado — usado para avisos por DM quando o recurso estiver ativo. Sua chave fica
                  sempre no painel.
                </p>
              </div>
              <form action={desvincularDiscordAction}>
                <ConfirmSubmit message="Desvincular o Discord desta conta?">DESVINCULAR</ConfirmSubmit>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-2">Nenhuma conta do Discord vinculada.</p>
              {discordConfigured() ? (
                <a href="/api/auth/discord?link=1" className="btn btn--ghost btn--sm">
                  VINCULAR
                </a>
              ) : (
                <p className="type-kicker">INDISPONÍVEL NESTE AMBIENTE</p>
              )}
            </div>
          )}
        </div>
      </Surface>

      <Surface className="mt-6">
        <SurfaceHead>Preferências</SurfaceHead>
        <form action={salvarPreferenciasAction} className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex items-center gap-3 text-sm text-ink-2">
            <input type="checkbox" name="notifyOptIn" defaultChecked={user.notifyOptIn} className="size-4" />
            Receber avisos de vencimento e novas versões por DM do Discord, quando o vínculo
            estiver ativo.
          </label>
          <button type="submit" className="btn btn--ghost btn--sm">
            SALVAR
          </button>
        </form>
      </Surface>

      <Surface className="mt-6">
        <SurfaceHead>Meus dados</SurfaceHead>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-ink-2">
            Baixe uma cópia dos seus dados (perfil, pedidos e licenças) em JSON.
          </p>
          <a href="/painel/conta/exportar" className="btn btn--ghost btn--sm">
            EXPORTAR MEUS DADOS
          </a>
        </div>
      </Surface>

      <Surface className="mt-6 overflow-hidden">
        <div className="hazard-bar" aria-hidden />
        <SurfaceHead>Zona destrutiva</SurfaceHead>
        <div className="p-5">
          <p className="text-sm text-ink-2">
            Solicitar a exclusão definitiva da conta e dos dados pessoais (LGPD). Abrimos um ticket de
            privacidade e o processo é conduzido pelo suporte — licenças ativas deixam de funcionar.
          </p>
          <form action={solicitarExclusaoAction} className="mt-4">
            <ConfirmSubmit message="Solicitar a exclusão da conta? Um ticket de privacidade será aberto e o suporte conduzirá o processo. Licenças ativas deixarão de funcionar ao concluir.">
              SOLICITAR EXCLUSÃO DA CONTA
            </ConfirmSubmit>
          </form>
        </div>
      </Surface>
    </div>
  )
}
