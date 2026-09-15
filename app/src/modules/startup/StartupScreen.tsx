import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { StartupEntry } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { ChamferSurface } from '../../components/ChamferSurface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { SegmentedProgress } from '../../components/SegmentedProgress'
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
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && entradas === null && (
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('lendo')}</p>
      )}

      {entradas !== null && (
        <>
          <ChamferSurface cut={12} className="st-hero">
            <div className="st-hero-info">
              <span className="st-hero-kicker">{t('heroKicker')}</span>
              <strong className="st-hero-num type-mono">{ativos}</strong>
              <span className="st-hero-desc">
                {t('heroResumo', { n: ativos, total: entradas.length })}
              </span>
            </div>
            <div className="st-hero-acao">
              {lote ? (
                <div className="st-hero-progresso">
                  <SegmentedProgress pct={(lote.feitos / lote.total) * 100} segments={20} hot />
                  <span className="type-mono text-[10px] tracking-[0.12em] text-ink-3">
                    {t('loteAndamento', { feitos: lote.feitos, total: lote.total })}
                  </span>
                </div>
              ) : (
                <>
                  <ArmSwitch armed={armado} onChange={setArmado} disabled={desativaveis === 0} />
                  <HoldButton
                    armed={armado && !ocupadoGeral && desativaveis > 0}
                    onConfirm={() => void desativarTodos()}
                  >
                    {t('desativarTodos', { n: desativaveis })}
                  </HoldButton>
                </>
              )}
              <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
                {t('reler')}
              </Button>
            </div>
          </ChamferSurface>

          <p className="st-nota my-4">{t('heroNota')}</p>

          {entradas.length === 0 && (
            <p className="type-mono p-6 text-center text-xs text-ink-3">{t('vazio')}</p>
          )}

          {entradas.length > 0 && (
            <ChamferSurface cut={8} className="p-2">
              <div className="st-list">
                {entradas.map((entrada) => (
                  <div key={entrada.id} className={`st-row ${entrada.ativado ? '' : 'st-row--off'}`}>
                    <span className="st-nome" title={entrada.nome}>
                      {entrada.nome}
                    </span>
                    <span className="st-cmd" title={entrada.comando}>
                      {entrada.comando}
                    </span>
                    <span className="st-origem">{t(`origem.${entrada.origemId}`)}</span>
                    <button
                      role="switch"
                      aria-checked={entrada.ativado}
                      className={`st-switch ${entrada.ativado ? 'st-switch--on' : ''}`}
                      disabled={entrada.protegido || ocupadoGeral}
                      onClick={() => void alternar(entrada)}
                    >
                      <StatusLED state={entrada.ativado ? 'live' : 'off'} label="" />
                      {entrada.protegido
                        ? t('protegido')
                        : entrada.ativado
                          ? t('ativo')
                          : t('desativado')}
                    </button>
                  </div>
                ))}
              </div>
            </ChamferSurface>
          )}

          <p className="st-nota mt-5">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
