import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { TweakCategoria, TweakState } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { ChamferSurface } from '../../components/ChamferSurface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { SegmentedProgress } from '../../components/SegmentedProgress'
import { StatusLED } from '../../components/StatusLED'
import { ErrorState } from '../../components/states'
import { dict } from './i18n'
import './tweaks.css'

type TweakId =
  | 'anuncio-id-off'
  | 'experiencias-personalizadas-off'
  | 'feedback-off'
  | 'historico-atividades-off'
  | 'telemetria-minima'
  | 'digitacao-voz-off'
  | 'localizacao-off'
  | 'telemetria-edge-off'
  | 'relatorio-erros-off'
  | 'autologger-off'
  | 'telemetria-driver-off'
  | 'tarefas-diagnostico-off'
  | 'sugestoes-menu-off'
  | 'copilot-off'
  | 'widgets-off'
  | 'busca-bing-off'
  | 'visual-cru'
  | 'miniaturas-off'
  | 'fonte-crua'
  | 'gamebar-off'
  | 'tela-cheia-classica'
  | 'flip-model-on'
  | 'mpo-off'
  | 'teclas-aderencia-off'
  | 'delivery-p2p-off'
  | 'llmnr-off'
  | 'netbios-off'
  | 'nic-energia-off'
  | 'dns-rapido'
  | 'hibernacao-off'
  | 'dump-minidump'
  | 'fth-off'
  | 'indexacao-off'
  | 'spooler-off'
  | 'acesso-remoto-off'
  | 'xbox-servicos-off'
  | 'manutencao-automatica-off'
  | 'ultimo-acesso-off'
  | 'prioridade-primeiro-plano'
  | 'msconfig-limites-off'
  | 'rsc-off'
  | 'vbs-off'

interface TweakDef {
  id: TweakId
  categoria: TweakCategoria
  reinicio?: boolean
  /** Fora do APLICAR TUDO: tem custo que a pessoa precisa escolher aceitar. */
  opcional?: boolean
}

const CATALOGO: TweakDef[] = [
  { id: 'anuncio-id-off', categoria: 'privacidade' },
  { id: 'experiencias-personalizadas-off', categoria: 'privacidade' },
  { id: 'feedback-off', categoria: 'privacidade' },
  { id: 'historico-atividades-off', categoria: 'privacidade' },
  { id: 'telemetria-minima', categoria: 'privacidade', reinicio: true },
  { id: 'digitacao-voz-off', categoria: 'privacidade', opcional: true },
  { id: 'localizacao-off', categoria: 'privacidade', reinicio: true, opcional: true },
  { id: 'telemetria-edge-off', categoria: 'privacidade' },
  { id: 'relatorio-erros-off', categoria: 'privacidade' },
  { id: 'autologger-off', categoria: 'privacidade', reinicio: true },
  { id: 'telemetria-driver-off', categoria: 'privacidade' },
  { id: 'tarefas-diagnostico-off', categoria: 'privacidade' },
  { id: 'sugestoes-menu-off', categoria: 'interface' },
  { id: 'copilot-off', categoria: 'interface', reinicio: true },
  { id: 'widgets-off', categoria: 'interface', reinicio: true },
  { id: 'busca-bing-off', categoria: 'interface', reinicio: true },
  { id: 'visual-cru', categoria: 'interface', reinicio: true },
  { id: 'miniaturas-off', categoria: 'interface', opcional: true },
  { id: 'fonte-crua', categoria: 'interface', reinicio: true, opcional: true },
  { id: 'gamebar-off', categoria: 'jogos' },
  { id: 'tela-cheia-classica', categoria: 'jogos' },
  { id: 'flip-model-on', categoria: 'jogos' },
  { id: 'mpo-off', categoria: 'jogos', reinicio: true, opcional: true },
  { id: 'teclas-aderencia-off', categoria: 'jogos' },
  { id: 'delivery-p2p-off', categoria: 'rede' },
  { id: 'llmnr-off', categoria: 'rede' },
  { id: 'netbios-off', categoria: 'rede' },
  { id: 'nic-energia-off', categoria: 'rede' },
  { id: 'dns-rapido', categoria: 'rede', opcional: true },
  { id: 'hibernacao-off', categoria: 'energia', opcional: true },
  { id: 'dump-minidump', categoria: 'energia' },
  { id: 'fth-off', categoria: 'energia' },
  { id: 'indexacao-off', categoria: 'servicos', opcional: true },
  { id: 'spooler-off', categoria: 'servicos', opcional: true },
  { id: 'acesso-remoto-off', categoria: 'servicos' },
  { id: 'xbox-servicos-off', categoria: 'servicos', opcional: true },
  { id: 'prioridade-primeiro-plano', categoria: 'jogos', reinicio: true },
  { id: 'msconfig-limites-off', categoria: 'jogos', reinicio: true },
  { id: 'rsc-off', categoria: 'rede' },
  { id: 'manutencao-automatica-off', categoria: 'servicos', opcional: true },
  { id: 'ultimo-acesso-off', categoria: 'servicos', reinicio: true },
]

const VBS: TweakDef = { id: 'vbs-off', categoria: 'seguranca', reinicio: true }

const GRUPOS: TweakCategoria[] = ['privacidade', 'interface', 'jogos', 'rede', 'energia', 'servicos']

export default function TweaksScreen() {
  const t = useT(dict)
  const pushToast = useToastsStore((s) => s.push)
  const [estados, setEstados] = useState<Record<string, TweakState> | null>(null)
  const [admin, setAdmin] = useState(true)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      const scan = await getAdapter().scanTweaks()
      setEstados(Object.fromEntries(scan.items.map((i) => [i.id, i])))
      setAdmin(scan.admin)
    } catch {
      setEstados(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  const disponivel = useCallback(
    (def: TweakDef) => {
      const estado = estados?.[def.id]
      return !!estado && (!estado.precisaAdmin || admin)
    },
    [estados, admin],
  )

  /** Lote nunca inclui OPCIONAL: esses têm custo (impressão, busca, localização)
   *  e só entram por clique individual em DETALHES. */
  const pendentesDe = useCallback(
    (defs: TweakDef[]) => defs.filter((d) => !d.opcional && disponivel(d) && !estados?.[d.id]?.ligado),
    [disponivel, estados],
  )

  const recomendados = useMemo(() => CATALOGO.filter((d) => !d.opcional), [])

  async function alternar(def: TweakDef) {
    const atual = estados?.[def.id]
    if (!atual) return
    const ligar = !atual.ligado
    setOcupado(def.id)
    try {
      const ligado = await getAdapter().setTweak(def.id, ligar)
      const nome = t(`tw.${def.id}.nome`)
      useLogStore.getState().log({
        moduloId: 'tweaks',
        acao: `${ligado ? 'aplicar' : 'restaurar'}-${def.id}`,
        resultado: ligado ? 'aplicado' : 'restaurado',
        reversivel: true,
        detalhes: def.id,
      })
      const chave = def.reinicio ? (ligado ? 'okReinicio' : 'okOffReinicio') : ligado ? 'okOn' : 'okOff'
      const extra = ligado !== ligar ? ` ${t('estadoDivergente')}` : ''
      pushToast({ tipo: 'sucesso', mensagem: `${t(chave, { nome })}${extra}` })
      setEstados((old) => (old ? { ...old, [def.id]: { ...atual, ligado } } : old))
      if (def.categoria === 'seguranca') setArmado(false)
    } catch {
      pushToast({ tipo: 'erro', mensagem: `${t('erroToggle')} ${t('erroToggleAcao')}` })
    } finally {
      setOcupado(null)
    }
  }

  async function aplicarLote(defs: TweakDef[], rotulo: string) {
    const alvos = pendentesDe(defs)
    if (alvos.length === 0) {
      pushToast({ tipo: 'sucesso', mensagem: t('jaTudoAplicado') })
      return
    }
    setLote({ feitos: 0, total: alvos.length })
    let aplicados = 0
    let falhas = 0
    let reinicio = false
    for (const def of alvos) {
      try {
        const ligado = await getAdapter().setTweak(def.id, true)
        if (ligado) {
          aplicados += 1
          if (def.reinicio) reinicio = true
          setEstados((old) =>
            old ? { ...old, [def.id]: { ...old[def.id], ligado: true } } : old,
          )
        }
      } catch {
        falhas += 1
      }
      setLote((old) => (old ? { ...old, feitos: old.feitos + 1 } : old))
    }
    setLote(null)
    useLogStore.getState().log({
      moduloId: 'tweaks',
      acao: `aplicar-lote-${rotulo}`,
      resultado: t('loteResultado', { n: aplicados, falhas }),
      reversivel: true,
      detalhes: alvos.map((d) => d.id).join(', '),
    })
    pushToast({
      tipo: falhas > 0 ? 'erro' : 'sucesso',
      mensagem:
        falhas > 0
          ? t('loteParcial', { n: aplicados, falhas })
          : reinicio
            ? t('loteOkReinicio', { n: aplicados })
            : t('loteOk', { n: aplicados }),
    })
  }

  const alternarDetalhe = (grupo: string) =>
    setAbertos((old) => {
      const novo = new Set(old)
      if (novo.has(grupo)) novo.delete(grupo)
      else novo.add(grupo)
      return novo
    })

  const vbs = estados?.['vbs-off']
  const pendentesTudo = pendentesDe(recomendados).length
  const ativosTudo = recomendados.filter((d) => estados?.[d.id]?.ligado).length
  const ocupadoGeral = ocupado !== null || lote !== null

  return (
    <div className="p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && estados === null && (
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('lendo')}</p>
      )}

      {estados !== null && (
        <>
          <ChamferSurface cut={12} className="tw-hero">
            <div className="tw-hero-info">
              <span className="tw-hero-kicker">{t('heroKicker')}</span>
              <strong className="tw-hero-num type-mono">{pendentesTudo}</strong>
              <span className="tw-hero-desc">
                {pendentesTudo > 0
                  ? t('heroPendentes', { n: pendentesTudo, ativos: ativosTudo })
                  : t('heroTudoFeito', { ativos: ativosTudo })}
              </span>
            </div>
            <div className="tw-hero-acao">
              {lote ? (
                <div className="tw-hero-progresso">
                  <SegmentedProgress pct={(lote.feitos / lote.total) * 100} segments={20} hot />
                  <span className="type-mono text-[10px] tracking-[0.12em] text-ink-3">
                    {t('aplicandoLote', { feitos: lote.feitos, total: lote.total })}
                  </span>
                </div>
              ) : (
                <Button
                  variant="primary"
                  disabled={ocupadoGeral || pendentesTudo === 0}
                  onClick={() => void aplicarLote(recomendados, 'tudo')}
                >
                  {t('aplicarTudo')}
                </Button>
              )}
              <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
                {t('reler')}
              </Button>
            </div>
          </ChamferSurface>

          {!admin && <p className="tw-aviso-admin mt-4">{t('semAdmin')}</p>}
          <p className="tw-nota mt-4">{t('heroNota')}</p>

          <div className="tw-grupos mt-6">
            {GRUPOS.map((grupo) => {
              const defs = CATALOGO.filter((d) => d.categoria === grupo)
              const ativos = defs.filter((d) => estados[d.id]?.ligado).length
              const pendentes = pendentesDe(defs).length
              const aberto = abertos.has(grupo)
              return (
                <section key={grupo} className="tw-grupo">
                  <div className="tw-grupo-head">
                    <div className="tw-grupo-nome">
                      <StatusLED state={pendentes === 0 ? 'live' : 'off'} label="" />
                      <span>{t(`grupo.${grupo}`)}</span>
                    </div>
                    <span className="tw-grupo-contagem type-mono">
                      {pendentes > 0
                        ? t('contagem', { ativos, total: defs.length })
                        : t('contagemFeito', { ativos, total: defs.length })}
                    </span>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={ocupadoGeral || pendentes === 0}
                      onClick={() => void aplicarLote(defs, grupo)}
                    >
                      {pendentes === 0 ? t('grupoFeito') : t('aplicarGrupo')}
                    </Button>
                    <button
                      className="tw-detalhe-btn"
                      aria-expanded={aberto}
                      onClick={() => alternarDetalhe(grupo)}
                    >
                      {aberto ? t('esconderDetalhes') : t('verDetalhes')}
                    </button>
                  </div>

                  {aberto && (
                    <div className="tw-lista">
                      {defs.map((def) => {
                        const estado = estados[def.id]
                        if (!estado) return null
                        return (
                          <div key={def.id} className={`tw-row ${estado.ligado ? 'tw-row--on' : ''}`}>
                            <span className="tw-nome">
                              {t(`tw.${def.id}.nome`)}
                              {(def.reinicio || def.opcional || (estado.precisaAdmin && !admin)) && (
                                <span className="tw-tags">
                                  {def.opcional && <span className="tw-tag">{t('tagOpcional')}</span>}
                                  {def.reinicio && <span className="tw-tag">{t('tagReinicio')}</span>}
                                  {estado.precisaAdmin && !admin && (
                                    <span className="tw-tag">{t('tagAdmin')}</span>
                                  )}
                                </span>
                              )}
                            </span>
                            <span className="tw-desc">{t(`tw.${def.id}.desc`)}</span>
                            <button
                              role="switch"
                              aria-checked={estado.ligado}
                              className={`st-switch ${estado.ligado ? 'st-switch--on' : ''}`}
                              disabled={ocupadoGeral || (estado.precisaAdmin && !admin)}
                              onClick={() => void alternar(def)}
                            >
                              <StatusLED state={estado.ligado ? 'live' : 'off'} label="" />
                              {ocupado === def.id
                                ? t('aplicando')
                                : estado.ligado
                                  ? t('ligado')
                                  : t('desligado')}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}

            {vbs && (
              <section className="tw-grupo tw-grupo--risco">
                <h2 className="tw-grupo-titulo">{t('grupo.seguranca')}</h2>
                <ChamferSurface cut={8} className="tw-hazard">
                  <div className="hazard h-1.5 w-full" aria-hidden />
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="tw-nome">{t('tw.vbs-off.nome')}</span>
                    <StatusLED
                      state={vbs.ligado ? 'live' : 'off'}
                      label={vbs.ligado ? t('ligado') : t('desligado')}
                    />
                  </div>
                  <p className="tw-desc mt-2">{t('tw.vbs-off.desc')}</p>
                  <p className="tw-hazard-aviso">{t('vbsAviso')}</p>
                  <div className="tw-hazard-acoes">
                    <ArmSwitch armed={armado} onChange={setArmado} disabled={!admin} />
                    <HoldButton
                      armed={armado && !ocupadoGeral && admin}
                      onConfirm={() => void alternar(VBS)}
                    >
                      {ocupado === 'vbs-off'
                        ? t('aplicando')
                        : vbs.ligado
                          ? t('religarProtecao')
                          : t('desligarProtecao')}
                    </HoldButton>
                  </div>
                </ChamferSurface>
              </section>
            )}
          </div>

          <p className="tw-nota tw-rodape">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
