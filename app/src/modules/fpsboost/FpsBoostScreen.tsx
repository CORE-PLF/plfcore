import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter, isTauriEnv } from '../../services/adapter'
import { invalidateScan, scanCached } from '../../services/scanCache'
import {
  FPS_BOOST_CATALOG,
  FPS_BOOST_FORA,
  FPS_BOOST_GRUPOS,
  FPS_BOOST_RISCO,
  type FpsBoostDef,
} from '../../services/fpsBoostCatalog'
import { registerRevert, useLogStore } from '../../stores/log'
import { useRestartStore } from '../../stores/restart'
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

const TurboIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
    <path d="M9 1.5 3.5 9H7l-.5 5.5L12.5 7H9l0-5.5Z" />
  </svg>
)

export default function FpsBoostScreen() {
  const t = useT(dict)
  const pushToast = useToastsStore((s) => s.push)
  const pushFeed = useKillfeedStore((s) => s.push)
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const emDemo = !isTauriEnv() || modoDemo

  const [scan, setScan] = useState<FpsBoostScan | null>(null)
  const [estados, setEstados] = useState<Record<string, FpsBoostState> | null>(null)
  const [erro, setErro] = useState(false)
  const [lendo, setLendo] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async (semCache = false) => {
    setErro(false)
    setLendo(true)
    try {
      await scanCached(
        'fpsboost',
        () => getAdapter().scanFpsBoost(),
        (resultado) => {
          setScan(resultado)
          setEstados(Object.fromEntries(resultado.items.map((i) => [i.id, i])))
        },
        semCache,
      )
    } catch {
      setScan(null)
      setEstados(null)
      setErro(true)
    } finally {
      setLendo(false)
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
      invalidateScan('fpsboost')
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
      if (def.reinicio) useRestartStore.getState().marcar(def.id)
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
    invalidateScan('fpsboost')
    let ligados = 0
    let falhas = 0
    let reinicio = false
    for (const def of alvos) {
      try {
        const ligado = await getAdapter().setFpsBoost(def.id, true)
        if (ligado) {
          ligados += 1
          if (def.reinicio) {
            reinicio = true
            useRestartStore.getState().marcar(def.id)
          }
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
        await ler(true)
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
  const gruposAbertos = FPS_BOOST_GRUPOS.filter((g) => abertos.has(g))

  return (
    <div className="fb-screen">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('titulo')}
        meta={t('meta', { n: FPS_BOOST_CATALOG.length, grupos: FPS_BOOST_GRUPOS.length })}
        actions={
          <>
            {emDemo && <DemoTag full />}
            {lendo && estados !== null && <span className="tag">{t('lendo')}</span>}
            <Button disabled={ocupadoGeral} onClick={() => void ler(true)}>
              {t('reler')}
            </Button>
          </>
        }
      />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler(true)} />}

      {!erro && estados === null && <p className="p-6 text-center text-[13px] text-ink-3">{t('lendo')}</p>}

      {estados !== null && scan !== null && (
        <>
          {/* ===== elemento dominante: o turbo ===== */}
          <Surface className="fb-hero">
            <div className="fb-hero-top">
              <div className="fb-hero-info">
                <span className="type-kicker">{t('heroKicker')}</span>
                <strong className={`fb-hero-num type-num ${pendentesTurbo > 0 ? 'fb-hero-num--hot' : ''}`}>
                  {pendentesTurbo}
                </strong>
              </div>
              <p className="fb-hero-desc">
                {pendentesTurbo > 0
                  ? t('heroPendentes', { n: pendentesTurbo, ativos: ativosTurbo })
                  : t('heroTudoFeito', { ativos: ativosTurbo })}
              </p>
              <div className="fb-hero-acao">
                {lote ? (
                  <div className="fb-hero-progresso">
                    <ProgressBar pct={(lote.feitos / lote.total) * 100} showPct={false} />
                    <span className="type-kicker type-num">{t('aplicandoLote', { feitos: lote.feitos, total: lote.total })}</span>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    variant={pendentesTurbo > 0 ? 'primary' : 'secondary'}
                    disabled={ocupadoGeral || pendentesTurbo === 0}
                    onClick={() => void ligarLote(recomendados, 'turbo')}
                  >
                    <TurboIcon />
                    {pendentesTurbo > 0 ? t('turbo') : t('turboFeito')}
                  </Button>
                )}
                <span className="text-[11px] text-ink-3">{t('heroReversivel')}</span>
              </div>
            </div>
            <div className="fb-hero-ctx">
              <span>{t('ctx')}</span>
              <span className="type-num text-ink-2">{t('ctxRam', { gb: scan.ramGb })}</span>
              <span className="text-ink-2">{scan.discoSolido ? t('ctxDiscoSsd') : t('ctxDiscoHdd')}</span>
              {!admin && <span className="tag tag--atencao">{t('semAdmin')}</span>}
              <span className="ml-auto">{t('heroOpcionalFora')}</span>
            </div>
          </Surface>

          <div className="fb-grupos">
            {FPS_BOOST_GRUPOS.map((grupo) => {
              const defs = FPS_BOOST_CATALOG.filter((d) => d.categoria === grupo)
              const ativos = defs.filter((d) => estados[d.id]?.ligado).length
              const pendentes = pendentesDe(defs).length
              const aberto = abertos.has(grupo)
              return (
                <Surface key={grupo} className="fb-grupo">
                  <div className="fb-grupo-nome">
                    <StatusLED state={pendentes === 0 ? 'live' : 'off'} />
                    <span>{t(`grupo.${grupo}`)}</span>
                  </div>
                  <span className="fb-grupo-contagem type-num">
                    {pendentes > 0
                      ? t('contagem', { ativos, total: defs.length })
                      : t('contagemFeito', { ativos, total: defs.length })}
                  </span>
                  <div className="fb-grupo-acoes">
                    <Button
                      size="sm"
                      variant={pendentes === 0 ? 'secondary' : 'primary'}
                      disabled={ocupadoGeral || pendentes === 0}
                      onClick={() => void ligarLote(defs, grupo)}
                    >
                      {pendentes === 0 ? t('grupoFeito') : t('aplicarGrupo')}
                    </Button>
                    <button className="fb-detalhe-btn" aria-expanded={aberto} onClick={() => alternarDetalhe(grupo)}>
                      {aberto ? t('esconderDetalhes') : t('verDetalhes')}
                    </button>
                  </div>
                </Surface>
              )
            })}
          </div>

          <div className="fb-bottom">
            <div className="fb-detalhes">
              {gruposAbertos.map((grupo) => {
                const defs = FPS_BOOST_CATALOG.filter((d) => d.categoria === grupo)
                return (
                  <Surface key={grupo} className="fb-detalhe-card">
                    <div className="surface-head">
                      <span>{t(`grupo.${grupo}`)}</span>
                      <button className="fb-detalhe-btn ml-auto" aria-expanded onClick={() => alternarDetalhe(grupo)}>
                        {t('esconderDetalhes')}
                      </button>
                    </div>
                    <div className="fb-lista">
                      {defs.map((def) => {
                        const estado = estados[def.id]
                        if (!estado) return null
                        const travado = !estado.disponivel || (estado.precisaAdmin && !admin)
                        const tags = [
                          def.opcional && t('tagOpcional'),
                          def.reinicio && t('tagReinicio'),
                          estado.precisaAdmin && !admin && t('tagAdmin'),
                          !estado.disponivel && t('tagIndisponivel'),
                        ].filter(Boolean)
                        return (
                          <div key={def.id} className={`fb-row ${!estado.disponivel ? 'fb-row--off' : ''}`}>
                            <div className="fb-row-nome">
                              <span>{nomeDe(def.id)}</span>
                              {tags.length > 0 && <span className={`tag ${!estado.disponivel ? 'tag--critical' : ''}`}>{tags.join(' · ')}</span>}
                            </div>
                            <span className="fb-desc">
                              {t(`fps.${def.id}.desc` as DictKey)}
                              {estado.detalhe && <span className="fb-medido">{estado.detalhe}</span>}
                            </span>
                            <button
                              role="switch"
                              aria-checked={estado.ligado}
                              className={`st-switch ${estado.ligado ? 'st-switch--on' : ''}`}
                              disabled={ocupadoGeral || travado}
                              onClick={() => void alternar(def)}
                            >
                              <StatusLED state={estado.ligado ? 'live' : 'off'} />
                              {ocupado === def.id ? t('aplicando') : estado.ligado ? t('ligado') : t('desligado')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </Surface>
                )
              })}

              {/* ===== honestidade: o que ficou fora do acervo, e por quê ===== */}
              {gruposAbertos.length === 0 && (
                <Surface className="fb-detalhe-card">
                  <div className="surface-head">
                    <span>{t('foraTitulo')}</span>
                    <span className="ml-auto text-[11px] font-normal normal-case tracking-normal text-ink-3">{t('foraNota')}</span>
                  </div>
                  <div className="fb-fora-grid">
                    {FPS_BOOST_FORA.map((id) => (
                      <div key={id} className="fb-fora-item">
                        <span className="fb-fora-nome">{t(`fora.${id}`)}</span>
                        <span className="fb-desc">{t(`fora.${id}.desc`)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="fb-nota">{t('nota')}</p>
                </Surface>
              )}
            </div>

            {risco && (
              <Surface className="fb-hazard">
                <div className="hazard-bar" aria-hidden />
                <div className="fb-hazard-body">
                  <div className="flex items-center gap-3">
                    <span className="fb-hazard-titulo">{t('grupo.risco')}</span>
                    <span className="ml-auto flex items-center gap-2 text-[11px] font-bold tracking-[0.06em] text-ink-3">
                      <span className={`led circle ${risco.ligado ? 'led--danger' : 'led--off'}`} aria-hidden />
                      {risco.ligado ? t('riscoLigado') : t('desligado')}
                    </span>
                  </div>
                  <span className="fb-hazard-nome">{nomeDe(FPS_BOOST_RISCO.id)}</span>
                  <span className="fb-desc">{t(`fps.${FPS_BOOST_RISCO.id}.desc` as DictKey)}</span>
                  <span className="fb-hazard-aviso">{t('riscoAviso')}</span>
                  <div className="fb-hazard-acoes">
                    <ArmSwitch armed={armado} onChange={setArmado} disabled={!admin} />
                    <HoldButton
                      className="flex-1"
                      armed={armado && !ocupadoGeral && admin}
                      onConfirm={() => void alternar(FPS_BOOST_RISCO)}
                    >
                      {ocupado === FPS_BOOST_RISCO.id
                        ? t('aplicando')
                        : risco.ligado
                          ? t('religarProtecao')
                          : t('desligarProtecao')}
                    </HoldButton>
                  </div>
                  <span className="fb-hazard-hint">{t('armeSegure')}</span>
                </div>
              </Surface>
            )}
          </div>
        </>
      )}
    </div>
  )
}
