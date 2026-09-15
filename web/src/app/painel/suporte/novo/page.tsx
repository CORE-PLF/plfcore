import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { criarTicketAction } from '@/lib/actions/painel'
import { Surface, Field, Kicker } from '@/components/ui'
import { TICKET_CATEGORIES, TICKET_PRIORITY_LABEL, firstParam, type SearchParams } from '../../helpers'

export default async function NovoTicketPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser()
  const erro = firstParam((await searchParams).erro)

  return (
    <div>
      <header className="mb-6">
        <Kicker>
          <Link href="/painel/suporte" className="hover:text-ink-1">
            SUPORTE
          </Link>{' '}
          / NOVO
        </Kicker>
        <h1 className="type-display text-3xl">Abrir ticket</h1>
      </header>

      <Surface className="max-w-2xl p-6">
        {erro && (
          <p className="mb-4 text-sm" style={{ color: 'var(--color-blood)' }} role="alert">
            {erro}
          </p>
        )}

        <form action={criarTicketAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="categoria" className="type-kicker mb-1.5 block">
                CATEGORIA
              </label>
              <select id="categoria" name="categoria" required className="field" defaultValue="duvida">
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="prioridade" className="type-kicker mb-1.5 block">
                PRIORIDADE
              </label>
              <select id="prioridade" name="prioridade" required className="field" defaultValue="NORMAL">
                {(Object.keys(TICKET_PRIORITY_LABEL) as (keyof typeof TICKET_PRIORITY_LABEL)[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {TICKET_PRIORITY_LABEL[p]}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <Field label="ASSUNTO" name="assunto" required minLength={3} placeholder="Resumo do caso" />

          <div>
            <label htmlFor="mensagem" className="type-kicker mb-1.5 block">
              MENSAGEM
            </label>
            <textarea
              id="mensagem"
              name="mensagem"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              className="field"
              placeholder="Descreva o que aconteceu, o que você esperava e o que já tentou."
            />
            <p className="mt-1.5 text-xs text-ink-3">
              Chaves de licença são mascaradas automaticamente — não precisamos da sua chave completa.
            </p>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn btn--primary">
              ENVIAR
            </button>
            <Link href="/painel/suporte" className="btn btn--ghost">
              CANCELAR
            </Link>
          </div>
        </form>
      </Surface>
    </div>
  )
}
