import { cookies } from 'next/headers'
import Link from 'next/link'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { sha256 } from '@/lib/crypto'
import { QUESTIONS, questionLabel } from '@/lib/recovery'
import { encerrarOutrasSessoesAction, trocarSenhaAction } from '@/lib/actions/painel'
import { Surface, Field, Kicker, StatusTag } from '@/components/ui'
import { firstParam, fmtDateTime, type SearchParams } from '../helpers'
import { ConfirmSubmit } from '../confirm-submit'
import { QuestionsForm, RecoveryCodeBlock } from './recovery-settings'

// mesmo nome usado em @/lib/session
const SESSION_COOKIE = 'bbx_session'

export default async function SegurancaPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const sp = await searchParams
  const ok = firstParam(sp.ok)
  const erro = firstParam(sp.erro)

  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const currentId = token ? sha256(token) : null

  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  const outras = sessions.filter((s) => s.id !== currentId).length

  const perguntas = await db.securityQuestion.findMany({
    where: { userId: user.id },
    orderBy: { slot: 'asc' },
  })
  const codigoAtivo = await db.recoveryCode.count({
    where: { userId: user.id, kind: 'ACCOUNT', usedAt: null },
  })
  const inicial = firstParam(sp.inicial) === '1'

  return (
    <div>
      <header className="mb-6">
        <Kicker>PAINEL</Kicker>
        <h1 className="type-display text-3xl">Segurança</h1>
      </header>

      {inicial && (
        <Surface className="mb-6 p-6">
          <Kicker className="mb-2">CONFIGURE A RECUPERAÇÃO AGORA</Kicker>
          <p className="text-sm text-ink-2">
            Sua conta não depende de e-mail. Sem perguntas de segurança ou código de recuperação,
            perder a senha significa perder o acesso — se as respostas E o código se perderem, nem
            o suporte consegue restaurar a conta. Configure abaixo — leva menos de um minuto.
          </p>
          <Link href="/painel" className="btn btn--ghost btn--sm mt-4 inline-block">
            DEIXAR PARA DEPOIS
          </Link>
        </Surface>
      )}

      {firstParam(sp.ok) === 'perguntas' && (
        <Surface flat className="mb-4 px-4 py-3">
          <p className="text-sm text-ink-1">
            ✓ Perguntas de segurança salvas. Elas já valem para recuperar a conta.
          </p>
        </Surface>
      )}

      {ok === 'sessoes' && (
        <Surface flat className="mb-4 px-4 py-3">
          <p className="text-sm text-ink-1">
            ✓ {firstParam(sp.n) ?? '0'} sessão(ões) encerrada(s). Esta sessão continua ativa.
          </p>
        </Surface>
      )}
      {ok === 'senha' && (
        <Surface flat className="mb-4 px-4 py-3">
          <p className="text-sm text-ink-1">✓ Senha alterada. As outras sessões foram encerradas.</p>
        </Surface>
      )}
      {erro && (
        <Surface flat className="mb-4 px-4 py-3" role="alert">
          <p className="text-sm" style={{ color: 'var(--color-blood)' }}>
            {erro}
          </p>
        </Surface>
      )}

      <Surface className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Kicker>SESSÕES ATIVAS</Kicker>
          {outras > 0 && (
            <form action={encerrarOutrasSessoesAction}>
              <ConfirmSubmit message="Encerrar todas as outras sessões? Você continua conectado apenas neste navegador.">
                ENCERRAR TODAS AS OUTRAS
              </ConfirmSubmit>
            </form>
          )}
        </div>

        <ul className="mt-4 space-y-3">
          {sessions.map((s) => {
            const atual = s.id === currentId
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                style={{ background: 'var(--color-void)', border: '1px solid var(--color-edge)', borderRadius: 6 }}
              >
                <div className="min-w-0">
                  <p className="type-mono text-sm text-ink-1">
                    {s.ip ?? 'IP NÃO REGISTRADO'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-3" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? 'Navegador não identificado'}
                  </p>
                  <p className="type-mono mt-0.5 text-xs text-ink-4">
                    CRIADA EM {fmtDateTime(s.createdAt)}
                  </p>
                </div>
                {atual && <StatusTag tone="ok">✓ ATUAL</StatusTag>}
              </li>
            )
          })}
        </ul>
      </Surface>

      <Surface className="mt-6 p-6">
        <Kicker className="mb-4">TROCAR SENHA</Kicker>
        {user.passwordHash ? (
          <form action={trocarSenhaAction} className="max-w-sm space-y-4">
            <Field
              label="SENHA ATUAL"
              name="atual"
              type="password"
              required
              autoComplete="current-password"
            />
            <Field
              label="NOVA SENHA"
              name="nova"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <p className="text-xs text-ink-3">
              Ao trocar a senha, todas as outras sessões são encerradas.
            </p>
            <button type="submit" className="btn btn--primary">
              TROCAR SENHA
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink-2">
            Esta conta entra só com Discord e ainda não tem senha. Para criar uma, use
            &quot;Recuperar acesso&quot; na tela de login com o seu e-mail.
          </p>
        )}
      </Surface>

      <Surface className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Kicker>RECUPERAÇÃO DE ACESSO — PERGUNTAS</Kicker>
          {perguntas.length === 2 ? (
            <StatusTag tone="ok">✓ CONFIGURADAS</StatusTag>
          ) : (
            <StatusTag tone="warn">NÃO CONFIGURADAS</StatusTag>
          )}
        </div>

        {perguntas.length === 2 && (
          <ul className="mt-4 space-y-2">
            {perguntas.map((q) => (
              <li
                key={q.slot}
                className="px-4 py-3 text-sm text-ink-2"
                style={{ background: 'var(--color-void)', border: '1px solid var(--color-edge)', borderRadius: 6 }}
              >
                <span className="type-mono text-xs text-ink-4">{q.slot}. </span>
                {questionLabel(q.question)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 mb-4 text-sm text-ink-3">
          {perguntas.length === 2
            ? 'As respostas nunca são exibidas. Para trocar as perguntas, confirme a senha atual.'
            : 'Duas perguntas com respostas que só você sabe. Elas permitem trocar a senha sem depender de e-mail.'}
        </p>
        <QuestionsForm
          hasQuestions={perguntas.length === 2}
          options={QUESTIONS.map((q) => ({ code: q.code, label: q.label }))}
        />
      </Surface>

      <Surface className="mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Kicker>RECUPERAÇÃO DE ACESSO — CÓDIGO</Kicker>
          {codigoAtivo > 0 ? (
            <StatusTag tone="ok">✓ CÓDIGO ATIVO</StatusTag>
          ) : (
            <StatusTag tone="warn">SEM CÓDIGO</StatusTag>
          )}
        </div>
        <div className="mt-4">
          <RecoveryCodeBlock hasActiveCode={codigoAtivo > 0} hasPassword={!!user.passwordHash} />
        </div>
      </Surface>
    </div>
  )
}
