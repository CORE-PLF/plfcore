import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useRestartStore } from '../../stores/restart'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { TweakCategoria, TweakState } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressBar } from '../../components/ProgressBar'
import { StatusLED } from '../../components/StatusLED'
import { IconWarn } from '../../components/icons'
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
      if (def.reinicio) useRestartStore.getState().marcar(def.id)
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
          if (def.reinicio) {
            reinicio = true
            useRestartStore.getState().marcar(def.id)
          }
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
  const gruposAbertos = GRUPOS.filter((g) => abertos.has(g))

  return (
    <div className="tw-screen">
      <ScreenTitle
        kicker={t('kicker')}
        title={t('titulo')}
        actions={
          <>
            {estados !== null && !admin && (
              <span className="tag tag--atencao">
                <IconWarn width={11} height={11} aria-hidden />
                {t('tagAdmin')}
              </span>
            )}
            <Button disabled={ocupadoGeral} onClick={() => void ler()}>
              {t('reler')}
            </Button>
          </>
        }
      />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && estados === null && (
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('lendo')}</p>
      )}

      {estados !== null && (
        <>
          <Surface className="tw-hero">
            <div className="tw-hero-main">
              <div className="tw-hero-num-wrap">
                <span className="type-kicker">{t('heroKicker')}</span>
                <strong className={`type-num tw-hero-num ${pendentesTudo > 0 ? 'tw-hero-num--hot' : ''}`}>
                  {pendentesTudo}
                </strong>
              </div>
              <span className="tw-hero-desc">
                {pendentesTudo > 0
                  ? t('heroPendentes', { n: pendentesTudo, ativos: ativosTudo })
                  : t('heroTudoFeito', { ativos: ativosTudo })}
              </span>
              <div className="tw-hero-acao">
                {lote ? (
                  <div className="tw-hero-progresso">
                    <ProgressBar pct={(lote.feitos / lote.total) * 100} />
                    <span className="type-num text-[11px] font-semibold tracking-[0.08em] text-ink-3">
                      {t('aplicandoLote', { feitos: lote.feitos, total: lote.total })}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={ocupadoGeral || pendentesTudo === 0}
                    onClick={() => void aplicarLote(recomendados, 'tudo')}
                  >
                    {t('aplicarTudo')}
                  </Button>
                )}
              </div>
            </div>
            <div className="tw-hero-foot">
              <span>{t('heroNota')}</span>
              {!admin && (
                <span className="tw-hero-aviso">
                  <IconWarn width={12} height={12} aria-hidden />
                  {t('semAdmin')}
                </span>
              )}
            </div>
          </Surface>

          <div className="tw-grupos">
            {GRUPOS.map((grupo) => {
              const defs = CATALOGO.filter((d) => d.categoria === grupo)
              const ativos = defs.filter((d) => estados[d.id]?.ligado).length
              const pendentes = pendentesDe(defs).length
              const aberto = abertos.has(grupo)
              return (
                <section key={grupo} className={`tw-grupo ${aberto ? 'tw-grupo--aberto' : ''}`}>
                  <div className="tw-grupo-nome">
                    <StatusLED state={pendentes === 0 ? 'live' : 'off'} />
                    <span>{t(`grupo.${grupo}`)}</span>
                  </div>
                  <span className="type-num tw-grupo-contagem">
                    {pendentes > 0
                      ? t('contagem', { ativos, total: defs.length })
                      : t('contagemFeito', { ativos, total: defs.length })}
                  </span>
                  <div className="tw-grupo-acoes">
                    <Button
                      size="sm"
                      variant={pendentes === 0 ? 'secondary' : 'primary'}
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
                </section>
              )
            })}
          </div>

          <div className={`tw-corpo ${vbs ? '' : 'tw-corpo--solo'}`}>
            <Surface className="tw-lista">
              <div className="surface-head">
                {t('listaTitulo')}
                {gruposAbertos.length > 0 && (
                  <span className="pill pill--value">{gruposAbertos.length}/{GRUPOS.length}</span>
                )}
              </div>
              <div className="tw-lista-scroll">
                {gruposAbertos.length === 0 && <p className="tw-lista-vazia">{t('listaVazia')}</p>}
                {gruposAbertos.map((grupo) => (
                  <div key={grupo}>
                    <div className="tw-sub">{t(`grupo.${grupo}`)}</div>
                    {CATALOGO.filter((d) => d.categoria === grupo).map((def) => {
                      const estado = estados[def.id]
                      if (!estado) return null
                      return (
                        <div key={def.id} className="tw-row">
                          <div className="tw-row-id">
                            <span className="tw-nome">{t(`tw.${def.id}.nome`)}</span>
                            {(def.reinicio || def.opcional || (estado.precisaAdmin && !admin)) && (
                              <span className="tw-tags">
                                {def.opcional && <span className="tag">{t('tagOpcional')}</span>}
                                {def.reinicio && <span className="tag">{t('tagReinicio')}</span>}
                                {estado.precisaAdmin && !admin && <span className="tag">{t('tagAdmin')}</span>}
                              </span>
                            )}
                          </div>
                          <span className="tw-desc">{t(`tw.${def.id}.desc`)}</span>
                          <button
                            role="switch"
                            aria-checked={estado.ligado}
                            className={`st-switch ${estado.ligado ? 'st-switch--on' : ''}`}
                            disabled={ocupadoGeral || (estado.precisaAdmin && !admin)}
                            onClick={() => void alternar(def)}
                          >
                            <StatusLED state={estado.ligado ? 'live' : 'off'} />
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
                ))}
              </div>
            </Surface>

            {vbs && (
              <Surface className="tw-hazard">
                <div className="hazard-bar" aria-hidden />
                <div className="tw-hazard-corpo">
                  <div className="tw-hazard-head">
                    <span>{t('grupo.seguranca')}</span>
                    <span className="tw-hazard-estado">
                      <StatusLED state={vbs.ligado ? 'live' : 'off'} />
                      {vbs.ligado ? t('ligado') : t('desligado')}
                    </span>
                  </div>
                  <span className="tw-nome">{t('tw.vbs-off.nome')}</span>
                  <span className="tw-desc">{t('tw.vbs-off.desc')}</span>
                  <span className="tw-hazard-aviso">{t('vbsAviso')}</span>
                  <div className="tw-hazard-acoes">
                    <ArmSwitch armed={armado} onChange={setArmado} disabled={!admin} />
                    <HoldButton
                      className="flex-1"
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
                  <span className="tw-arme">{t('armeSegure')}</span>
                </div>
              </Surface>
            )}
          </div>

          <p className="tw-nota">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
