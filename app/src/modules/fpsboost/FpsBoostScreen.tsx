import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter, isTauriEnv } from '../../services/adapter'
import {
  FPS_BOOST_CATALOG,
  FPS_BOOST_FORA,
  FPS_BOOST_GRUPOS,
  FPS_BOOST_RISCO,
  type FpsBoostDef,
} from '../../services/fpsBoostCatalog'
import { registerRevert, useLogStore } from '../../stores/log'
import { useKillfeedStore } from '../../stores/killfeed'
import { useSettingsStore } from '../../stores/settings'
import { useToastsStore } from '../../stores/toasts'
import type { FpsBoostScan, FpsBoostState } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressBar } from '../../components/ProgressBar'
import { StatusLED } from '../../components/StatusLED'
import { DemoTag } from '../../components/Tag'
import { ErrorState } from '../../components/states'
import { dict } from './i18n'
import './fpsboost.css'

type DictKey = keyof (typeof dict)['pt']

export default function FpsBoostScreen() {
  const t = useT(dict)
  const pushToast = useToastsStore((s) => s.push)
  const pushFeed = useKillfeedStore((s) => s.push)
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const emDemo = !isTauriEnv() || modoDemo

  const [scan, setScan] = useState<FpsBoostScan | null>(null)
  const [estados, setEstados] = useState<Record<string, FpsBoostState> | null>(null)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      const resultado = await getAdapter().scanFpsBoost()
      setScan(resultado)
      setEstados(Object.fromEntries(resultado.items.map((i) => [i.id, i])))
    } catch {
      setScan(null)
      setEstados(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  const admin = scan?.admin ?? true

  const operavel = useCallback(
    (def: FpsBoostDef) => {
      const estado = estados?.[def.id]
      return !!estado && estado.disponivel && (!estado.precisaAdmin || admin)
    },
    [estados, admin],
  )

  /** TURBO nunca inclui OPCIONAL: esses têm custo (temperatura, compatibilidade, disco). */
  const pendentesDe = useCallback(
    (defs: FpsBoostDef[]) => defs.filter((d) => !d.opcional && operavel(d) && !estados?.[d.id]?.ligado),
    [operavel, estados],
  )

  const recomendados = useMemo(() => FPS_BOOST_CATALOG.filter((d) => !d.opcional), [])

  const nomeDe = (id: string) => t(`fps.${id}.nome` as DictKey)

  async function alternar(def: FpsBoostDef) {
    const atual = estados?.[def.id]
    if (!atual) return
    const ligar = !atual.ligado
    setOcupado(def.id)
    try {
      const ligado = await getAdapter().setFpsBoost(def.id, ligar)
      const nome = nomeDe(def.id)
      const logId = useLogStore.getState().log({
        moduloId: 'fpsboost',
        acao: `${ligado ? 'ligar' : 'restaurar'}-${def.id}`,
        resultado: ligado ? 'ligado' : 'restaurado',
        reversivel: ligado,
        detalhes: def.id,
      })
      if (ligado) {
        registerRevert(logId, async () => {
          await getAdapter().setFpsBoost(def.id, false)
          setEstados((old) => (old && old[def.id] ? { ...old, [def.id]: { ...old[def.id], ligado: false } } : old))
        })
        pushFeed({ alvo: nome, acao: 'ajustado', quantidade: null, logId })
      }
      const chave = def.reinicio ? (ligado ? 'okReinicio' : 'okOffReinicio') : ligado ? 'okOn' : 'okOff'
      const extra = ligado !== ligar ? ` ${t('estadoDivergente')}` : ''
      pushToast({ tipo: 'sucesso', mensagem: `${t(chave, { nome })}${extra}` })
      setEstados((old) => (old ? { ...old, [def.id]: { ...atual, ligado } } : old))
      if (def.categoria === 'risco') setArmado(false)
    } catch {
      pushToast({ tipo: 'erro', mensagem: `${t('erroToggle')} ${t('erroToggleAcao')}` })
    } finally {
      setOcupado(null)
    }
  }

  async function ligarLote(defs: FpsBoostDef[], rotulo: string) {
    const alvos = pendentesDe(defs)
    if (alvos.length === 0) {
      pushToast({ tipo: 'sucesso', mensagem: t('jaTudoAplicado') })
      return
    }
    setLote({ feitos: 0, total: alvos.length })
    let ligados = 0
    let falhas = 0
    let reinicio = false
    for (const def of alvos) {
      try {
        const ligado = await getAdapter().setFpsBoost(def.id, true)
        if (ligado) {
          ligados += 1
          if (def.reinicio) reinicio = true
          setEstados((old) => (old ? { ...old, [def.id]: { ...old[def.id], ligado: true } } : old))
          pushFeed({ alvo: nomeDe(def.id), acao: 'ajustado', quantidade: null, logId: null })
        }
      } catch {
        falhas += 1
      }
      setLote((old) => (old ? { ...old, feitos: old.feitos + 1 } : old))
    }
    setLote(null)
    const logId = useLogStore.getState().log({
      moduloId: 'fpsboost',
      acao: `ligar-lote-${rotulo}`,
      resultado: t('loteResultado', { n: ligados, falhas }),
      reversivel: ligados > 0,
      detalhes: alvos.map((d) => d.id).join(', '),
    })
    if (ligados > 0) {
      registerRevert(logId, async () => {
        for (const def of alvos) {
          await getAdapter().setFpsBoost(def.id, false)
        }
        await ler()
      })
    }
    pushToast({
      tipo: falhas > 0 ? 'erro' : 'sucesso',
      mensagem:
        falhas > 0
          ? t('loteParcial', { n: ligados, falhas })
          : reinicio
            ? t('loteOkReinicio', { n: ligados })
            : t('loteOk', { n: ligados }),
    })
  }

  const alternarDetalhe = (grupo: string) =>
    setAbertos((old) => {
      const novo = new Set(old)
      if (novo.has(grupo)) novo.delete(grupo)
      else novo.add(grupo)
      return novo
    })

  const risco = estados?.[FPS_BOOST_RISCO.id]
  const pendentesTurbo = pendentesDe(recomendados).length
  const ativosTurbo = recomendados.filter((d) => estados?.[d.id]?.ligado).length
  const ocupadoGeral = ocupado !== null || lote !== null

  return (
    <div className="p-8">
      <div className="flex items-start justify-between">
        <ScreenTitle kicker={t('kicker')} title={t('titulo')} />
        {emDemo && <DemoTag full />}
      </div>

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && estados === null && (
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('lendo')}</p>
      )}

      {estados !== null && scan !== null && (
        <>
          {/* ===== elemento dominante: o turbo ===== */}
          <Surface cut={12} className="fb-hero stage-grid">
            <div className="fb-hero-info">
              <span className="fb-hero-kicker">{t('heroKicker')}</span>
              <strong className={`fb-hero-num type-mono ${pendentesTurbo > 0 ? 'fb-hero-num--hot' : ''}`}>
                {pendentesTurbo}
              </strong>
              <span className="fb-hero-desc">
                {pendentesTurbo > 0
                  ? t('heroPendentes', { n: pendentesTurbo, ativos: ativosTurbo })
                  : t('heroTudoFeito', { ativos: ativosTurbo })}
              </span>
            </div>
            <div className="fb-hero-acao">
              {lote ? (
                <div className="fb-hero-progresso">
                  <ProgressBar pct={(lote.feitos / lote.total) * 100} segments={20} hot />
                  <span className="type-mono text-[10px] tracking-[0.12em] text-ink-3">
                    {t('aplicandoLote', { feitos: lote.feitos, total: lote.total })}
                  </span>
                </div>
              ) : (
                <Button
                  variant="primary"
                  className="fb-turbo"
                  disabled={ocupadoGeral || pendentesTurbo === 0}
                  onClick={() => void ligarLote(recomendados, 'turbo')}
                >
                  {t('turbo')}
                </Button>
              )}
              <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
                {t('reler')}
              </Button>
            </div>
            <div className="fb-hero-ctx type-mono">
              <span className="text-ink-4">{t('ctx')}</span>
              <span>{t('ctxRam', { gb: scan.ramGb })}</span>
              <span>{scan.discoSolido ? t('ctxDiscoSsd') : t('ctxDiscoHdd')}</span>
            </div>
          </Surface>

          {!admin && <p className="fb-aviso-admin mt-4">{t('semAdmin')}</p>}
          <p className="fb-nota mt-4">{t('heroNota')}</p>

          <div className="fb-grupos mt-6">
            {FPS_BOOST_GRUPOS.map((grupo) => {
              const defs = FPS_BOOST_CATALOG.filter((d) => d.categoria === grupo)
              const ativos = defs.filter((d) => estados[d.id]?.ligado).length
              const pendentes = pendentesDe(defs).length
              const aberto = abertos.has(grupo)
              return (
                <section key={grupo} className="fb-grupo">
                  <div className="fb-grupo-head">
                    <div className="fb-grupo-nome">
                      <StatusLED state={pendentes === 0 ? 'live' : 'off'} label="" />
                      <span>{t(`grupo.${grupo}`)}</span>
                    </div>
                    <span className="fb-grupo-contagem type-mono">
                      {pendentes > 0
                        ? t('contagem', { ativos, total: defs.length })
                        : t('contagemFeito', { ativos, total: defs.length })}
                    </span>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={ocupadoGeral || pendentes === 0}
                      onClick={() => void ligarLote(defs, grupo)}
                    >
                      {pendentes === 0 ? t('grupoFeito') : t('aplicarGrupo')}
                    </Button>
                    <button className="fb-detalhe-btn" aria-expanded={aberto} onClick={() => alternarDetalhe(grupo)}>
                      {aberto ? t('esconderDetalhes') : t('verDetalhes')}
                    </button>
                  </div>

                  {aberto && (
                    <div className="fb-lista">
                      {defs.map((def) => {
                        const estado = estados[def.id]
                        if (!estado) return null
                        const travado = !estado.disponivel || (estado.precisaAdmin && !admin)
                        return (
                          <div
                            key={def.id}
                            className={`fb-row ${estado.ligado ? 'fb-row--on' : ''} ${!estado.disponivel ? 'fb-row--off' : ''}`}
                          >
                            <span className="fb-nome">
                              {nomeDe(def.id)}
                              <span className="fb-tags">
                                {def.opcional && <span className="fb-tag">{t('tagOpcional')}</span>}
                                {def.reinicio && <span className="fb-tag">{t('tagReinicio')}</span>}
                                {estado.precisaAdmin && !admin && <span className="fb-tag">{t('tagAdmin')}</span>}
                                {!estado.disponivel && <span className="fb-tag fb-tag--off">{t('tagIndisponivel')}</span>}
                              </span>
                            </span>
                            <span className="fb-desc">
                              {t(`fps.${def.id}.desc` as DictKey)}
                              {estado.detalhe && <span className="fb-detalhe">{estado.detalhe}</span>}
                            </span>
                            <button
                              role="switch"
                              aria-checked={estado.ligado}
                              className={`st-switch ${estado.ligado ? 'st-switch--on' : ''}`}
                              disabled={ocupadoGeral || travado}
                              onClick={() => void alternar(def)}
                            >
                              <StatusLED state={estado.ligado ? 'live' : 'off'} label="" />
                              {ocupado === def.id ? t('aplicando') : estado.ligado ? t('ligado') : t('desligado')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}

            {risco && (
              <section className="fb-grupo fb-grupo--risco">
                <h2 className="fb-grupo-titulo">{t('grupo.risco')}</h2>
                <Surface cut={8} className="fb-hazard">
                  <div className="hazard h-1.5 w-full" aria-hidden />
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="fb-nome">{nomeDe(FPS_BOOST_RISCO.id)}</span>
                    <StatusLED state={risco.ligado ? 'live' : 'off'} label={risco.ligado ? t('ligado') : t('desligado')} />
                  </div>
                  <p className="fb-desc mt-2">{t(`fps.${FPS_BOOST_RISCO.id}.desc` as DictKey)}</p>
                  <p className="fb-hazard-aviso">{t('riscoAviso')}</p>
                  <div className="fb-hazard-acoes">
                    <ArmSwitch armed={armado} onChange={setArmado} disabled={!admin} />
                    <HoldButton armed={armado && !ocupadoGeral && admin} onConfirm={() => void alternar(FPS_BOOST_RISCO)}>
                      {ocupado === FPS_BOOST_RISCO.id
                        ? t('aplicando')
                        : risco.ligado
                          ? t('religarProtecao')
                          : t('desligarProtecao')}
                    </HoldButton>
                  </div>
                </Surface>
              </section>
            )}
          </div>

          {/* ===== honestidade: o que ficou fora do acervo, e por quê ===== */}
          <section className="fb-fora mt-8">
            <h2 className="fb-grupo-titulo">{t('foraTitulo')}</h2>
            <p className="fb-nota">{t('foraNota')}</p>
            <div className="fb-fora-grid mt-3">
              {FPS_BOOST_FORA.map((id) => (
                <div key={id} className="fb-fora-item">
                  <span className="fb-fora-nome">{t(`fora.${id}`)}</span>
                  <span className="fb-fora-desc">{t(`fora.${id}.desc`)}</span>
                </div>
              ))}
            </div>
          </section>

          <p className="fb-nota fb-rodape">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
