import { requireStaff } from '@/lib/auth'
import { db } from '@/lib/db'
import { getSetting, getSettingNumber } from '@/lib/settings'
import { deleteFlagAction, saveSettingsAction, upsertFlagAction } from '@/lib/actions/admin'
import { Chamfer, StatusTag } from '@/components/ui'
import { Flash, PageTitle, Table, Td, centsToInput, type SP } from '../../_ui'
import { TotpSetup } from './totp-setup'

export default async function AdminConfigPage({ searchParams }: { searchParams: Promise<SP> }) {
  const staff = await requireStaff('ADMIN')
  const sp = await searchParams

  const [refundDays, payoutMin, cooldownDays, discordInvite, discordRole, maintenance, flags] = await Promise.all([
    getSettingNumber('refund_window_days', 7),
    getSettingNumber('payout_min_cents', 5000),
    getSettingNumber('device_reset_cooldown_days', 30),
    getSetting<string>('discord_invite', ''),
    getSetting<string>('discord_role_cliente', ''),
    getSetting<boolean>('maintenance_mode', false),
    db.featureFlag.findMany({ orderBy: { key: 'asc' } }),
  ])
  const [checkoutEnabled, activationEnabled, minVersion, supportUrl] = await Promise.all([
    getSetting<boolean>('checkout_enabled', true),
    getSetting<boolean>('activation_enabled', true),
    getSetting<string>('min_desktop_version', ''),
    getSetting<string>('support_url', ''),
  ])

  return (
    <>
      <PageTitle kicker="CONFIGURAÇÕES" title="PARÂMETROS DA OPERAÇÃO" />
      <Flash sp={sp} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Chamfer cut={8} className="p-5">
          <h2 className="type-kicker mb-3">PARÂMETROS</h2>
          <form action={saveSettingsAction} className="grid gap-3">
            <div>
              <label htmlFor="refund_window_days" className="type-kicker mb-1.5 block">JANELA DE REEMBOLSO (DIAS)</label>
              <input
                id="refund_window_days"
                name="refund_window_days"
                type="number"
                min={0}
                required
                defaultValue={refundDays}
                className="field type-mono"
              />
            </div>
            <div>
              <label htmlFor="payout_min" className="type-kicker mb-1.5 block">SAQUE MÍNIMO DE AFILIADO (R$)</label>
              <input
                id="payout_min"
                name="payout_min"
                required
                inputMode="decimal"
                defaultValue={centsToInput(payoutMin)}
                className="field type-mono"
              />
            </div>
            <div>
              <label htmlFor="device_reset_cooldown_days" className="type-kicker mb-1.5 block">
                COOLDOWN DE TROCA DE DISPOSITIVO (DIAS)
              </label>
              <input
                id="device_reset_cooldown_days"
                name="device_reset_cooldown_days"
                type="number"
                min={0}
                required
                defaultValue={cooldownDays}
                className="field type-mono"
              />
            </div>
            <div>
              <label htmlFor="discord_invite" className="type-kicker mb-1.5 block">CONVITE DO DISCORD (URL)</label>
              <input id="discord_invite" name="discord_invite" defaultValue={discordInvite} className="field" />
            </div>
            <div>
              <label htmlFor="discord_role_cliente" className="type-kicker mb-1.5 block">ID DO CARGO "CLIENTE" NO DISCORD</label>
              <input
                id="discord_role_cliente"
                name="discord_role_cliente"
                defaultValue={discordRole}
                className="field type-mono"
              />
            </div>
            <div>
              <label htmlFor="min_desktop_version" className="type-kicker mb-1.5 block">
                VERSÃO MÍNIMA DO APP (EX.: 1.2.0 — VAZIO = SEM MÍNIMO)
              </label>
              <input
                id="min_desktop_version"
                name="min_desktop_version"
                defaultValue={minVersion}
                placeholder="1.0.0"
                className="field type-mono max-w-[160px]"
              />
            </div>
            <div>
              <label htmlFor="support_url" className="type-kicker mb-1.5 block">URL DE SUPORTE (STATUS/CONTATO)</label>
              <input id="support_url" name="support_url" defaultValue={supportUrl} className="field" />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="checkout_enabled" defaultChecked={checkoutEnabled} /> CHECKOUT LIGADO (VENDAS
              ABERTAS)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="activation_enabled" defaultChecked={activationEnabled} /> NOVAS ATIVAÇÕES
              LIGADAS (VALIDATE/HEARTBEAT NUNCA BLOQUEIAM)
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" name="maintenance_mode" defaultChecked={maintenance} /> MODO MANUTENÇÃO (SITE AVISA
              E CHECKOUT PAUSA)
            </label>
            <button type="submit" className="btn btn--primary chamfer">
              SALVAR CONFIGURAÇÕES
            </button>
          </form>
        </Chamfer>

        <div className="space-y-6">
          <Chamfer cut={8} className="p-5">
            <h2 className="type-kicker mb-3">2FA DA SUA CONTA ({staff.email})</h2>
            <TotpSetup enabled={Boolean(staff.totpSecret)} />
          </Chamfer>

          <Chamfer cut={8} className="p-5">
            <h2 className="type-kicker mb-3">FEATURE FLAGS</h2>
            {flags.length === 0 ? (
              <p className="type-mono mb-3 text-[12px] text-ink-3">Nenhuma flag cadastrada.</p>
            ) : (
              <div className="mb-4">
                <Table head={['CHAVE', 'ESTADO', 'DESCRIÇÃO', '']}>
                  {flags.map((f) => (
                    <tr key={f.key}>
                      <Td className="text-ink-1">{f.key}</Td>
                      <Td>
                        <StatusTag tone={f.enabled ? 'ok' : 'muted'}>{f.enabled ? 'LIGADA' : 'DESLIGADA'}</StatusTag>
                      </Td>
                      <Td className="max-w-[200px] whitespace-normal">{f.description ?? '—'}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <form action={upsertFlagAction}>
                            <input type="hidden" name="key" value={f.key} />
                            <input type="hidden" name="description" value={f.description ?? ''} />
                            {f.enabled ? null : <input type="hidden" name="enabled" value="on" />}
                            <button type="submit" className="btn btn--ghost btn--sm chamfer">
                              {f.enabled ? 'DESLIGAR' : 'LIGAR'}
                            </button>
                          </form>
                          <form action={deleteFlagAction}>
                            <input type="hidden" name="key" value={f.key} />
                            <button type="submit" className="btn btn--danger btn--sm chamfer">
                              REMOVER
                            </button>
                          </form>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
            <form action={upsertFlagAction} className="flex flex-wrap items-center gap-2">
              <input
                name="key"
                required
                pattern="[a-z0-9_.\-]{2,64}"
                placeholder="nova_flag"
                aria-label="Chave da flag"
                className="field type-mono max-w-[180px]"
              />
              <input name="description" placeholder="Descrição" aria-label="Descrição" className="field max-w-[240px]" />
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" name="enabled" /> LIGADA
              </label>
              <button type="submit" className="btn btn--ghost btn--sm chamfer">
                CRIAR FLAG
              </button>
            </form>
          </Chamfer>
        </div>
      </div>
    </>
  )
}
