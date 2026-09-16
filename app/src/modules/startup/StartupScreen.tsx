import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { StartupEntry } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressBar } from '../../components/ProgressBar'
import { StatusLED } from '../../components/StatusLED'
import { ErrorState } from '../../components/states'
import { dict } from './i18n'
import './startup.css'

export default function StartupScreen() {
  const t = useT(dict)
  const pushToast = useToastsStore((s) => s.push)
  const [entradas, setEntradas] = useState<StartupEntry[] | null>(null)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      const itens = await getAdapter().scanStartup()
      itens.sort((a, b) => Number(b.ativado) - Number(a.ativado) || a.nome.localeCompare(b.nome))
      setEntradas(itens)
    } catch {
      setEntradas(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  async function alternar(entrada: StartupEntry) {
    const ativar = !entrada.ativado
    setOcupado(entrada.id)
    try {
      const ativado = await getAdapter().toggleStartup(entrada.id, ativar)
      useLogStore.getState().log({
        moduloId: 'startup',
        acao: ativado ? `ativar-${entrada.nome}` : `desativar-${entrada.nome}`,
        resultado: ativado ? 'ativado' : 'desativado',
        reversivel: true,
        detalhes: entrada.comando,
      })
      pushToast({
        tipo: 'sucesso',
        mensagem: t(ativado ? 'okOn' : 'okOff', { nome: entrada.nome.toUpperCase() }),
      })
      setEntradas((old) =>
        old ? old.map((e) => (e.id === entrada.id ? { ...e, ativado } : e)) : old,
      )
    } catch {
      pushToast({ tipo: 'erro', mensagem: `${t('erroToggle')} ${t('erroToggleAcao')}` })
    } finally {
      setOcupado(null)
    }
  }

  async function desativarTodos() {
    const alvos = (entradas ?? []).filter((e) => e.ativado && !e.protegido)
    if (alvos.length === 0) return
    setLote({ feitos: 0, total: alvos.length })
    let ok = 0
    let falhas = 0
    for (const entrada of alvos) {
      try {
        const ativado = await getAdapter().toggleStartup(entrada.id, false)
        if (!ativado) {
          ok += 1
          setEntradas((old) =>
            old ? old.map((e) => (e.id === entrada.id ? { ...e, ativado: false } : e)) : old,
          )
        }
      } catch {
        falhas += 1
      }
      setLote((old) => (old ? { ...old, feitos: old.feitos + 1 } : old))
    }
    setLote(null)
    setArmado(false)
    useLogStore.getState().log({
      moduloId: 'startup',
      acao: 'desativar-todos',
      resultado: t('loteResultado', { n: ok, falhas }),
      reversivel: true,
      detalhes: alvos.map((e) => e.nome).join(', '),
    })
    pushToast({
      tipo: falhas > 0 ? 'erro' : 'sucesso',
      mensagem: falhas > 0 ? t('loteParcial', { n: ok, falhas }) : t('loteOk', { n: ok }),
    })
  }

  const ativos = entradas?.filter((e) => e.ativado).length ?? 0
  const desativaveis = (entradas ?? []).filter((e) => e.ativado && !e.protegido).length
  const ocupadoGeral = ocupado !== null || lote !== null

  return (
    <div className="h-full overflow-y-auto p-8">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('titulo')}
        actions={
          entradas !== null && (
            <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
              {t('reler')}
            </Button>
          )
        }
      />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && entradas === null && <p className="type-kicker p-6 text-center">{t('lendo')}</p>}

      {entradas !== null && (
        <>
          <Surface className="overflow-hidden">
            <div className="hazard-bar" aria-hidden />
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-8 p-5 max-[1400px]:gap-5">
              <div className="flex max-w-[230px] flex-col gap-1">
                <span className="type-kicker">{t('heroKicker')}</span>
                <span className="st-hero-num">{ativos}</span>
                <span className="text-[11px] font-semibold text-ink-3">{t('heroResumo', { n: ativos, total: entradas.length })}</span>
              </div>
              <p className="st-nota">{t('heroNota')}</p>
              <div className="flex flex-col items-end gap-2">
                {lote ? (
                  <div className="st-hero-progresso">
                    <ProgressBar pct={(lote.feitos / lote.total) * 100} hot showPct={false} />
                    <span className="type-kicker text-right">{t('loteAndamento', { feitos: lote.feitos, total: lote.total })}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <ArmSwitch armed={armado} onChange={setArmado} disabled={desativaveis === 0} />
                    <HoldButton
                      armed={armado && !ocupadoGeral && desativaveis > 0}
                      onConfirm={() => void desativarTodos()}
                    >
                      {t('desativarTodos', { n: desativaveis })}
                    </HoldButton>
                  </div>
                )}
                <span className="text-[10px] font-semibold tracking-[0.1em] text-ink-3">{t('armeSegure')}</span>
              </div>
            </div>
          </Surface>

          {entradas.length === 0 && <p className="type-kicker p-6 text-center">{t('vazio')}</p>}

          {entradas.length > 0 && (
            <Surface className="mt-4 overflow-hidden">
              <div className="surface-head">
                {t('listaTitulo')}
                <span className="pill pill--value ml-auto">{t('listaAtivos', { n: ativos, total: entradas.length })}</span>
              </div>
              <div>
                {entradas.map((entrada) => (
                  <div key={entrada.id} className={`st-row ${entrada.ativado ? '' : 'st-row--off'}`}>
                    <span className="st-nome" title={entrada.nome}>
                      {entrada.nome}
                    </span>
                    <span className="st-cmd" title={entrada.comando}>
                      {entrada.comando}
                    </span>
                    <span className="tag">{t(`origem.${entrada.origemId}`)}</span>
                    <button
                      role="switch"
                      aria-checked={entrada.ativado}
                      className={`st-switch ${entrada.ativado ? 'st-switch--on' : ''}`}
                      disabled={entrada.protegido || ocupadoGeral}
                      onClick={() => void alternar(entrada)}
                    >
                      <StatusLED state={entrada.ativado ? 'live' : 'off'} label="" />
                      {entrada.protegido ? t('protegido') : entrada.ativado ? t('ativo') : t('desativado')}
                    </button>
                  </div>
                ))}
              </div>
            </Surface>
          )}

          <p className="st-nota mt-4">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
