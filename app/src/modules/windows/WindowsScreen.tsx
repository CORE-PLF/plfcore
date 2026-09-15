import { useEffect, useState } from 'react'
import { BRAND } from '../../brand'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { ChamferSurface } from '../../components/ChamferSurface'
import { HoldButton } from '../../components/HoldButton'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressModal } from '../../components/Modal'
import { DemoTag } from '../../components/Tag'
import { IconCheck } from '../../components/icons'
import { ErrorState } from '../../components/states'
import { useT } from '../../i18n'
import { isTauriEnv } from '../../services/adapter'
import { LevelOneFlow } from '../../shell/LevelOneFlow'
import { LEVEL_META, useLevelStore } from '../../stores/level'
import { useSettingsStore } from '../../stores/settings'
import { useToastsStore } from '../../stores/toasts'
import type { ReadinessLevel } from '../../types'
import { winDict } from './i18n'
import './windows.css'

type WinKey = keyof (typeof winDict)['pt']

const ORDEM: ReadinessLevel[] = [5, 4, 3, 2, 1]

/** O que cada nível aplica de verdade — espelha o switch $profile de src-tauri/src/apply.ps1. */
const MUDANCAS: Record<ReadinessLevel, WinKey[]> = {
  5: ['mud.5.baseline', 'mud.5.plano', 'mud.5.ponto'],
  4: ['mud.4.plano'],
  3: ['mud.3.plano', 'mud.3.gamemode', 'mud.3.mmcss'],
  2: [
    'mud.2.plano',
    'mud.2.cpu',
    'mud.2.usbPcie',
    'mud.2.suspensao',
    'mud.2.gamemode',
    'mud.2.dvr',
    'mud.2.mmcss',
    'mud.2.qos',
    'mud.2.throttling',
    'mud.2.rede',
    'mud.2.tcp',
    'mud.2.apps',
  ],
  1: [
    'mud.1.base',
    'mud.1.gpu',
    'mud.1.interface',
    'mud.1.efeitos',
    'mud.1.transparencia',
    'mud.1.servicos',
    'mud.1.tarefas',
    'mud.1.mouse',
    'mud.1.teclado',
    'mud.1.preflight',
  ],
}

/** Só o L1 mexe em serviços, tarefas e interface — os três gatilhos de reinício no apply.ps1. */
const REINICIO: ReadinessLevel[] = [1]

const ETAPAS = [
  'inventario', 'backup', 'energia', 'registro', 'jogos', 'qos', 'interface',
  'servicos', 'tarefas', 'consistencia', 'aguardando-windows', 'confirmando-energia',
] as const

const etapaConhecida = (id: string): id is (typeof ETAPAS)[number] =>
  (ETAPAS as readonly string[]).includes(id)

interface Progresso {
  nivel: ReadinessLevel
  pct: number | null
  etapa: string | null
  inicio: number
}

export default function WindowsScreen() {
  const t = useT(winDict)
  const marca = BRAND.name
  const { atual, pendingLevel, setPending, applyLevel } = useLevelStore()
  const modoDemo = useSettingsStore((s) => s.modoDemo)
  const emDemo = !isTauriEnv() || modoDemo

  const [progresso, setProgresso] = useState<Progresso | null>(null)
  const [elapsedS, setElapsedS] = useState(0)
  const [armado, setArmado] = useState(false)
  const [erro, setErro] = useState<{ nivel: ReadinessLevel; codigo: string } | null>(null)

  useEffect(() => {
    if (!progresso) {
      setElapsedS(0)
      return
    }
    const inicio = progresso.inicio
    const h = setInterval(() => setElapsedS(Math.floor((Date.now() - inicio) / 1000)), 500)
    return () => clearInterval(h)
  }, [progresso?.inicio])

  const etapaLabel = (id: string | null) => {
    if (id === null) return t('etapa.validando')
    return etapaConhecida(id) ? t(`etapa.${id}` as WinKey, { marca }) : t('etapa.aplicando')
  }

  const aplicar = async (n: ReadinessLevel) => {
    if (progresso) return
    setErro(null)
    setProgresso({ nivel: n, pct: null, etapa: null, inicio: Date.now() })
    try {
      await applyLevel(n, (pct, etapaId) =>
        setProgresso((p) => (p ? { ...p, pct, etapa: etapaId } : p)),
      )
      setArmado(false)
      useToastsStore.getState().push({
        tipo: 'sucesso',
        mensagem: `${t('toast.aplicado')} — L${n} ${t(`nome.${n}` as const)}`,
      })
    } catch (error) {
      setErro({ nivel: n, codigo: error instanceof Error ? error.message : 'ERR_OPT_APPLY' })
      useToastsStore.getState().push({ tipo: 'erro', mensagem: t('toast.erro') })
    } finally {
      setProgresso(null)
    }
  }

  const ocupado = progresso !== null

  const acao = (n: ReadinessLevel) => {
    if (atual === n) {
      return (
        <div className="win-aplicado">
          <span className="win-aplicado-selo">
            <IconCheck width={16} height={16} aria-hidden />
            {t('aplicado')}
          </span>
          <small>{t('aplicadoNota')}</small>
        </div>
      )
    }
    if (progresso?.nivel === n) {
      return <Button variant="primary" disabled>{t('aplicando')}</Button>
    }
    if (n === 1) {
      return (
        <Button variant="primary" disabled={ocupado} onClick={() => setPending(1)}>
          {t('prepararL1')}
        </Button>
      )
    }
    if (LEVEL_META[n].exigeArmamento) {
      return (
        <div className="win-armar">
          <ArmSwitch armed={armado} onChange={setArmado} disabled={ocupado} />
          <HoldButton armed={armado && !ocupado} onConfirm={() => void aplicar(n)}>
            {t('aplicar')}
          </HoldButton>
        </div>
      )
    }
    return (
      <Button variant="primary" disabled={ocupado} onClick={() => void aplicar(n)}>
        {t('aplicar')}
      </Button>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      <ChamferSurface cut={12} className="win-hero">
        <div className="win-hero-info">
          <span className="type-mono win-hero-code">L{atual}</span>
          <div className="win-hero-txt">
            <div className="win-hero-linha">
              <span className="type-display win-hero-nome">{t(`nome.${atual}` as const)}</span>
              {atual !== 5 && <span className="win-tag">{t('reversivel')}</span>}
              {emDemo && <DemoTag />}
            </div>
            <p className="win-hero-agora">{t(`agora.${atual}` as const, { marca })}</p>
          </div>
        </div>
        {atual !== 5 && (
          <Button disabled={ocupado} onClick={() => void aplicar(5)}>
            {t('voltarOriginal')}
          </Button>
        )}
      </ChamferSurface>

      {erro && (
        <div className="mt-4">
          <ErrorState
            what={t('erro.titulo', { n: erro.nivel, codigo: erro.codigo })}
            todo={t('erro.acao')}
            onRetry={() => void aplicar(erro.nivel)}
          />
        </div>
      )}

      <section className="win-regua" aria-label={t('regua')}>
        {ORDEM.map((n) => (
          <ChamferSurface
            key={n}
            cut={8}
            className={`win-card ${atual === n ? 'is-current' : ''} ${n === 1 ? 'win-card--l1' : ''} ${n === 2 ? 'win-card--l2' : ''}`}
          >
            {n === 1 && <div className="hazard win-card-faixa" aria-hidden />}
            <div className="win-card-corpo">
              <div className="win-card-id">
                <span className="type-mono win-card-code">L{n}</span>
                <span className="type-display win-card-nome">{t(`nome.${n}` as const)}</span>
                <p className="win-card-alvo">{t(`alvo.${n}` as const)}</p>
                <div className="win-card-tags">
                  {LEVEL_META[n].exigeArmamento && n !== 1 && (
                    <span className="win-tag win-tag--atencao">▲ {t('tag.armar')}</span>
                  )}
                  {n === 1 && <span className="win-tag win-tag--atencao">▲ {t('tag.preflight')}</span>}
                  {REINICIO.includes(n) && <span className="win-tag">{t('tag.reinicio')}</span>}
                </div>
              </div>

              <div className="win-card-mud">
                <p className="type-kicker">{t('mudancas')}</p>
                <ul className="win-mud-lista">
                  {MUDANCAS[n].map((k) => (
                    <li key={k} className="win-mud">{t(k, { marca })}</li>
                  ))}
                </ul>
              </div>

              <div className="win-card-acao">{acao(n)}</div>
            </div>
          </ChamferSurface>
        ))}
      </section>

      <div className="win-rodape">
        <p className="type-kicker">{t('nota.titulo')}</p>
        <p className="win-nota">{t('nota.corpo')}</p>
        <p className="win-nota">{t('nota.backup')}</p>
      </div>

      <ProgressModal
        open={progresso !== null}
        title={progresso ? `L${progresso.nivel} — ${t(`nome.${progresso.nivel}` as const)}` : ''}
        step={progresso ? etapaLabel(progresso.etapa) : ''}
        pct={progresso?.pct ?? null}
        elapsedS={elapsedS}
        cancellable={false}
      />

      <LevelOneFlow open={pendingLevel === 1} onCancel={() => setPending(null)} />
    </div>
  )
}
