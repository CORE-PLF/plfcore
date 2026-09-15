'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { emitirLicencaAction, type EmitirState } from '@/lib/actions/revenda'
import { formatCents } from '@/lib/money'
import { Chamfer, Kicker, RuleFade } from '@/components/ui'

interface PlanOption {
  id: string
  name: string
  durationDays: number | null
  listCents: number
  costCents: number
}

const initial: EmitirState = { error: null }

export function EmitirForm({ plans, balanceCents }: { plans: PlanOption[]; balanceCents: number }) {
  const [state, action, pending] = useActionState(emitirLicencaAction, initial)
  const [planId, setPlanId] = useState<string>('')
  const selected = plans.find((p) => p.id === planId) ?? null
  const saldoApos = selected ? balanceCents - selected.costCents : null

  if (state.ok && state.plainKey) return <Emitida state={state} />

  if (plans.length === 0)
    return (
      <Chamfer cut={8} className="p-6">
        <p style={{ color: 'var(--color-ink-2)' }}>
          Nenhum plano disponível para emissão no momento. Fale com o suporte.
        </p>
      </Chamfer>
    )

  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset>
        <legend className="type-kicker mb-3">PLANO</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => {
            const active = planId === plan.id
            return (
              <label key={plan.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="planId"
                  value={plan.id}
                  checked={active}
                  onChange={() => setPlanId(plan.id)}
                  className="sr-only"
                  required
                />
                <Chamfer
                  cut={8}
                  edge={active ? 'var(--color-signal)' : undefined}
                  className="p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ color: 'var(--color-ink-1)' }}>{plan.name}</span>
                    {active && (
                      <span className="type-mono text-xs" style={{ color: 'var(--color-signal)' }}>
                        SELECIONADO
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-3)' }}>
                    {plan.durationDays === null ? 'Vitalício' : `${plan.durationDays} dias`} — tabela{' '}
                    {formatCents(plan.listCents)}
                  </p>
                  <p className="type-mono mt-2 text-lg" style={{ color: 'var(--color-ink-1)' }}>
                    {formatCents(plan.costCents)}{' '}
                    <span className="text-xs" style={{ color: 'var(--color-ink-3)' }}>
                      EM CRÉDITOS
                    </span>
                  </p>
                </Chamfer>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="customerLabel" className="type-kicker mb-1.5 block">
          IDENTIFICAÇÃO DO CLIENTE (RÓTULO LIVRE)
        </label>
        <input
          id="customerLabel"
          name="customerLabel"
          type="text"
          maxLength={120}
          placeholder="Ex.: joao@exemplo.com, pedido #482, Discord fulano"
          className="field"
        />
        <p className="mt-1.5 text-xs" style={{ color: 'var(--color-ink-4)' }}>
          Aparece na sua lista de licenças e nos relatórios. Só você e a equipe veem.
        </p>
      </div>

      {selected && (
        <Chamfer cut={8} edge="var(--color-signal)" className="p-5">
          <Kicker>CONFIRMAÇÃO</Kicker>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="type-kicker">CUSTO</p>
              <p className="type-mono text-3xl" style={{ color: 'var(--color-ink-1)' }}>
                {formatCents(selected.costCents)}
              </p>
            </div>
            <div>
              <p className="type-kicker">SALDO APÓS</p>
              <p
                className="type-mono text-xl"
                style={{ color: saldoApos !== null && saldoApos < 0 ? 'var(--color-signal)' : 'var(--color-ink-2)' }}
              >
                {saldoApos !== null ? formatCents(saldoApos) : '—'}
              </p>
            </div>
          </div>
          {saldoApos !== null && saldoApos < 0 && (
            <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-signal)' }}>
              Saldo insuficiente. Compre créditos antes de emitir.
            </p>
          )}
        </Chamfer>
      )}

      {state.error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-signal)' }}>
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !selected || (saldoApos !== null && saldoApos < 0)}
        className="btn btn--primary chamfer self-start"
      >
        {pending ? 'EMITINDO…' : selected ? `EMITIR — ${formatCents(selected.costCents)}` : 'EMITIR'}
      </button>
    </form>
  )
}

function Emitida({ state }: { state: EmitirState }) {
  return (
    <Chamfer cut={12} brackets className="p-6">
      <p style={{ color: 'var(--color-ink-1)' }}>✓ LICENÇA EMITIDA — {state.planName}</p>
      <RuleFade className="my-4" />
      <Kicker>CHAVE DA LICENÇA</Kicker>
      <p
        className="type-mono mt-2 break-all text-xl sm:text-2xl"
        style={{ color: 'var(--color-ink-1)' }}
      >
        {state.plainKey}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <CopiarButton value={state.plainKey ?? ''} />
        <Link href="/revenda/licencas" className="btn btn--ghost chamfer">
          VER MINHAS LICENÇAS
        </Link>
        <a href="/revenda/emitir" className="btn btn--ghost chamfer">
          EMITIR OUTRA
        </a>
      </div>
      <p className="mt-4 text-sm" style={{ color: 'var(--color-ink-3)' }}>
        Entregue esta chave ao seu cliente. Ela também fica disponível na sua lista de licenças.
      </p>
      {state.costCents !== undefined && state.balanceAfter !== undefined && (
        <p className="type-mono mt-2 text-xs" style={{ color: 'var(--color-ink-4)' }}>
          DEBITADO {formatCents(state.costCents)} — SALDO {formatCents(state.balanceAfter)}
        </p>
      )}
    </Chamfer>
  )
}

function CopiarButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="btn btn--primary chamfer"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
      }}
    >
      {copied ? 'COPIADA ✓' : 'COPIAR'}
    </button>
  )
}
