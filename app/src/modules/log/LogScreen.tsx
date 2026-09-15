import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { ScreenTitle } from '../../components/Kicker'
import { Odometer } from '../../components/Odometer'
import { KTag } from '../../components/Tag'
import { EmptyState } from '../../components/states'
import { useT } from '../../i18n'
import { useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useNav } from '../../stores/nav'
import { useToastsStore } from '../../stores/toasts'
import type { OperationLog } from '../../types'
import { logDict } from './i18n'
import './log.css'

function fmtTs(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export default function LogScreen() {
  const t = useT(logDict)
  const logs = useLogStore((s) => s.logs)
  const revert = useLogStore((s) => s.revert)
  const pushToast = useToastsStore((s) => s.push)
  const pushFeed = useKillfeedStore((s) => s.push)
  const anchor = useNav((s) => s.anchor)
  const go = useNav((s) => s.go)

  const [busca, setBusca] = useState('')
  const [modulosSel, setModulosSel] = useState<ReadonlySet<string>>(new Set())
  const refs = useRef(new Map<string, HTMLLIElement>())

  const ordenados = useMemo(() => [...logs].reverse(), [logs])
  const modulos = useMemo(() => [...new Set(logs.map((l) => l.moduloId))].sort(), [logs])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return ordenados.filter((l) => {
      if (modulosSel.size > 0 && !modulosSel.has(l.moduloId)) return false
      if (q === '') return true
      return `${l.moduloId} ${l.acao} ${l.resultado} ${l.detalhes}`.toLowerCase().includes(q)
    })
  }, [ordenados, modulosSel, busca])

  useEffect(() => {
    if (!anchor) return
    refs.current.get(anchor)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [anchor, filtrados.length])

  const toggleModulo = (id: string) => {
    setModulosSel((prev) => {
      const prox = new Set(prev)
      if (prox.has(id)) prox.delete(id)
      else prox.add(id)
      return prox
    })
  }

  const exportar = () => {
    const texto = useLogStore.getState().exportText()
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `plfcore-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    pushToast({ tipo: 'sucesso', mensagem: t('toastExportado') })
  }

  const reverterLog = async (log: OperationLog) => {
    const ok = await revert(log.id)
    if (ok) {
      pushToast({ tipo: 'sucesso', mensagem: t('toastRevertido') })
      pushFeed({ alvo: log.acao, acao: 'revertido', quantidade: null, logId: log.id })
    } else {
      pushToast({ tipo: 'erro', mensagem: t('toastRevertFalha') })
    }
  }

  const limparFiltros = () => {
    setBusca('')
    setModulosSel(new Set())
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-6">
          <ScreenTitle kicker={t('kicker')} title={t('titulo')} />
          <div className="flex shrink-0 items-center gap-5">
            <div className="text-right">
              <p className="type-kicker">{t('registros')}</p>
              <Odometer value={logs.length} className="text-3xl font-bold text-ink-1" />
            </div>
            <Button variant="primary" onClick={exportar} disabled={logs.length === 0}>
              {t('exportar')}
            </Button>
          </div>
        </div>

        {logs.length === 0 ? (
          <EmptyState
            code={t('vazioCode')}
            message={t('vazioMsg')}
            action={<Button onClick={() => go('cleanup')}>{t('rodarAnalise')}</Button>}
          />
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <Surface cut={4} flat className="min-w-64 flex-1">
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={t('buscar')}
                  aria-label={t('buscar')}
                  className="type-mono w-full bg-transparent px-3 py-[9px] text-xs text-ink-1 placeholder:text-ink-4"
                />
              </Surface>
              <div role="group" aria-label={t('filtrar')} className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="chamfer log-chip"
                  aria-pressed={modulosSel.size === 0}
                  onClick={() => setModulosSel(new Set())}
                >
                  {t('todos')}
                </button>
                {modulos.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="chamfer log-chip"
                    aria-pressed={modulosSel.has(m)}
                    onClick={() => toggleModulo(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {filtrados.length === 0 ? (
              <div className="border border-line p-5">
                <p className="type-mono text-xs font-bold tracking-[0.1em] text-ink-1">
                  {t('semResultado')}
                </p>
                <p className="mt-1 text-sm text-ink-2">{t('semResultadoMsg')}</p>
                <Button size="sm" className="mt-3" onClick={limparFiltros}>
                  {t('limparFiltros')}
                </Button>
              </div>
            ) : (
              <ol className="log-timeline">
                {filtrados.map((l, i) => {
                  const ancorado = anchor === l.id
                  return (
                    <li
                      key={l.id}
                      ref={(el) => {
                        if (el) refs.current.set(l.id, el)
                        else refs.current.delete(l.id)
                      }}
                      className={`log-entry ${l.revertido ? 'log-reverted' : ''} ${ancorado ? 'brackets' : ''}`}
                    >
                      {ancorado && (
                        <>
                          <span /><span /><span /><span />
                        </>
                      )}
                      <span
                        className={`log-node led circle ${l.revertido ? 'led--off' : i === 0 ? 'led--live' : 'led--heat'}`}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <time dateTime={l.timestampIso} className="type-mono text-[11px] text-ink-3">
                          {fmtTs(l.timestampIso)}
                        </time>
                        <span className="tag text-ink-3">{l.moduloId.toUpperCase()}</span>
                        {l.revertido && <KTag variant="ok">{t('revertido')}</KTag>}
                        <span className="flex-1" />
                        {l.reversivel && !l.revertido && (
                          <Button size="sm" onClick={() => void reverterLog(l)}>
                            {t('reverter')}
                          </Button>
                        )}
                      </div>
                      <p className="log-strike type-mono mt-1 text-sm font-bold text-ink-1">
                        {l.acao}
                        <span className="mx-2 text-ink-4">/</span>
                        <span className="text-xs font-normal text-ink-2">{l.resultado}</span>
                      </p>
                      {l.detalhes !== '' && <p className="mt-0.5 text-xs text-ink-3">{l.detalhes}</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </div>
  )
}
