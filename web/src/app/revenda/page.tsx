import type { Metadata } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/money'
import { Chamfer, Kicker, RuleFade, SegProgress, StatusTag } from '@/components/ui'
import { resellerForUser } from './guards'
import { InscricaoForm } from './inscricao-form'
import { LedgerTable } from './ledger-table'
import { WebhookForm } from './webhook-form'

export const metadata: Metadata = { title: 'Revenda' }

export default async function RevendaPage() {
  const { reseller } = await resellerForUser()

  if (!reseller) return <Inscricao />
  if (reseller.status === 'PENDING') return <EstadoPendente />
  if (reseller.status === 'SUSPENDED') return <EstadoSuspenso />

  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const monthStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1))

  const [total, hoje, mes, movimentos] = await Promise.all([
    db.license.count({ where: { resellerId: reseller.id } }),
    db.license.count({ where: { resellerId: reseller.id, createdAt: { gte: dayStart } } }),
    db.license.count({ where: { resellerId: reseller.id, createdAt: { gte: monthStart } } }),
    db.resellerLedger.findMany({
      where: { resellerId: reseller.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ])

  const descontoPct = (reseller.discountBps / 100).toLocaleString('pt-BR', {
    maximumFractionDigits: 2,
  })

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Kicker>PAINEL DE REVENDA</Kicker>
        <h1 className="type-display mt-1 text-4xl">OPERAÇÃO</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Chamfer cut={12} brackets className="p-6 lg:col-span-2">
          <Kicker>SALDO DE CRÉDITOS</Kicker>
          <p className="type-mono mt-2 text-5xl font-bold sm:text-6xl" style={{ color: 'var(--color-ink-1)' }}>
            {formatCents(reseller.creditBalanceCents)}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/revenda/creditos" className="btn btn--primary chamfer">
              COMPRAR CRÉDITOS
            </Link>
            <Link href="/revenda/emitir" className="btn btn--ghost chamfer">
              EMITIR LICENÇA
            </Link>
          </div>
        </Chamfer>

        <div className="flex flex-col gap-4">
          <Chamfer cut={8} className="p-5">
            <Kicker>NÍVEL / DESCONTO</Kicker>
            <p className="type-mono mt-1 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
              NÍVEL {reseller.tier}
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-2)' }}>
              {descontoPct}% OFF na tabela
            </p>
          </Chamfer>
          <Chamfer cut={8} className="p-5">
            <Kicker>LICENÇAS EMITIDAS</Kicker>
            <p className="type-mono mt-1 text-2xl" style={{ color: 'var(--color-ink-1)' }}>
              {total}
            </p>
          </Chamfer>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Chamfer cut={8} className="p-5">
          <div className="flex items-baseline justify-between gap-4">
            <Kicker>EMITIDAS HOJE</Kicker>
            <span className="type-mono text-sm" style={{ color: 'var(--color-ink-1)' }}>
              {hoje} / {reseller.dailyIssueLimit}
            </span>
          </div>
          <SegProgress
            className="mt-3"
            value={hoje}
            max={reseller.dailyIssueLimit}
            label={`Emissões hoje: ${hoje} de ${reseller.dailyIssueLimit}`}
          />
        </Chamfer>
        <Chamfer cut={8} className="p-5">
          <div className="flex items-baseline justify-between gap-4">
            <Kicker>EMITIDAS NO MÊS</Kicker>
            <span className="type-mono text-sm" style={{ color: 'var(--color-ink-1)' }}>
              {mes} / {reseller.monthlyIssueLimit}
            </span>
          </div>
          <SegProgress
            className="mt-3"
            value={mes}
            max={reseller.monthlyIssueLimit}
            label={`Emissões no mês: ${mes} de ${reseller.monthlyIssueLimit}`}
          />
        </Chamfer>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="type-display text-2xl">ÚLTIMAS MOVIMENTAÇÕES</h2>
          <Link href="/revenda/creditos" className="type-kicker hover:text-[var(--color-ink-1)]">
            EXTRATO COMPLETO
          </Link>
        </div>
        <RuleFade className="my-4" />
        <LedgerTable entries={movimentos} />
      </section>

      <section>
        <h2 className="type-display text-2xl">WEBHOOK DE EVENTOS</h2>
        <RuleFade className="my-4" />
        <Chamfer cut={8} className="max-w-2xl p-5">
          <p className="text-sm" style={{ color: 'var(--color-ink-2)' }}>
            Receba notificações de eventos (licença emitida, revogada) via POST na sua URL. Só
            HTTPS público — endereço interno ou IP privado é rejeitado. Deixe vazio para desativar.
          </p>
          <div className="mt-3">
            <WebhookForm currentUrl={reseller.webhookUrl} />
          </div>
          {reseller.webhookSecret ? (
            <div className="mt-4">
              <Kicker>SEGREDO HMAC (HEADER X-SIGNATURE)</Kicker>
              <p className="type-mono mt-1 break-all bg-void px-3 py-2 text-xs" style={{ color: 'var(--color-ink-2)' }}>
                {reseller.webhookSecret}
              </p>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-3)' }}>
                Valide cada entrega: HMAC-SHA256 (hex) do corpo bruto com este segredo.
              </p>
            </div>
          ) : null}
        </Chamfer>
      </section>
    </div>
  )
}

function Inscricao() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <Kicker>PROGRAMA DE REVENDA</Kicker>
        <h1 className="type-display mt-1 text-4xl">REVENDA PLF CORE</h1>
      </div>

      <Chamfer cut={12} className="p-6">
        <p style={{ color: 'var(--color-ink-2)' }}>Como funciona, sem letra miúda:</p>
        <ol className="mt-4 flex flex-col gap-3 text-sm" style={{ color: 'var(--color-ink-2)' }}>
          <li className="flex gap-3">
            <span className="type-mono" style={{ color: 'var(--color-signal)' }}>01</span>
            Você compra créditos com desconto sobre o preço de tabela.
          </li>
          <li className="flex gap-3">
            <span className="type-mono" style={{ color: 'var(--color-signal)' }}>02</span>
            Emite licenças usando os créditos, na hora, direto do painel.
          </li>
          <li className="flex gap-3">
            <span className="type-mono" style={{ color: 'var(--color-signal)' }}>03</span>
            Entrega a chave ao seu cliente final pelo preço que você definir.
          </li>
        </ol>
        <RuleFade className="my-4" />
        <p className="text-sm" style={{ color: 'var(--color-ink-3)' }}>
          A aprovação é manual. Acompanhe nesta mesma página — o painel de revenda é liberado
          assim que a análise terminar.
        </p>
      </Chamfer>

      <Chamfer cut={12} className="p-6">
        <h2 className="type-display mb-4 text-2xl">INSCRIÇÃO</h2>
        <InscricaoForm />
      </Chamfer>
    </div>
  )
}

function EstadoPendente() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Chamfer cut={12} className="p-8">
        <StatusTag tone="warn">EM ANÁLISE</StatusTag>
        <h1 className="type-display mt-3 text-3xl">INSCRIÇÃO RECEBIDA</h1>
        <p className="mt-3" style={{ color: 'var(--color-ink-2)' }}>
          Sua inscrição está na fila de aprovação manual. Quando a análise terminar, este painel é
          liberado automaticamente — volte aqui para conferir.
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-3)' }}>
          Nada a fazer por enquanto — não é preciso reenviar a inscrição.
        </p>
      </Chamfer>
    </div>
  )
}

function EstadoSuspenso() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <Chamfer cut={12} edge="var(--color-rust)" className="p-8">
        <StatusTag tone="danger">SUSPENSA</StatusTag>
        <h1 className="type-display mt-3 text-3xl">CONTA DE REVENDA SUSPENSA</h1>
        <p className="mt-3" style={{ color: 'var(--color-ink-2)' }}>
          Sua conta de revendedor foi suspensa e a emissão de licenças está bloqueada. O saldo de
          créditos permanece registrado no extrato.
        </p>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-3)' }}>
          Para entender o motivo e pedir revisão, abra um ticket com o suporte.
        </p>
        <Link href="/suporte" className="btn btn--ghost chamfer mt-6">
          FALAR COM O SUPORTE
        </Link>
      </Chamfer>
    </div>
  )
}
