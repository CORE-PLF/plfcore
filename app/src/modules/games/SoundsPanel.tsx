// Instalador de mods de som do GTA V. Troca arquivo do jogo: só entra em servidor
// com sv_pureLevel 0 ou 1 — por isso o aviso de pure mode fica sempre visível, e o
// caminho de volta (RESTAURAR ORIGINAL) é tão visível quanto o de ida.

import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { registerRevert, useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { SoundsScan } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { DemoTag, KTag } from '../../components/Tag'
import { MetricRow } from '../../components/MetricRow'
import { IconCheck, IconWarn } from '../../components/icons'
import { ErrorState } from '../../components/states'

import { dict } from './i18n'

const MB = 1024 ** 2

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  return `${Math.round(b / MB)} MB`
}

const ERROS = {
  ERR_SND_SEM_GTA: 'sndErrSemGta',
  ERR_SND_GERACAO: 'sndErrGeracao',
  ERR_GAME_RUNNING: 'sndBloqJogo',
  ERR_SND_PACK: 'sndErrPack',
  ERR_SND_SEM_BACKUP: 'sndErrSemBackup',
  ERR_SND_HASH: 'sndErrHash',
  ERR_SND_COPIA: 'sndErrCopia',
} as const

type Msg = (typeof ERROS)[keyof typeof ERROS] | 'sndErro' | 'sndErrPrevia'

export function SoundsPanel() {
  const t = useT(dict)

  const pushToast = useToastsStore((s) => s.push)
  const [scan, setScan] = useState<SoundsScan | null>(null)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      setScan(await getAdapter().scanSounds())
    } catch {
      setScan(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  function avisar(e: unknown, padrao: Msg = 'sndErro') {
    const codigo = e instanceof Error ? e.message : ''
    const achado = (Object.keys(ERROS) as Array<keyof typeof ERROS>).find((k) => codigo.includes(k))
    pushToast({ tipo: 'erro', mensagem: t(achado ? ERROS[achado] : padrao) })
  }

  async function instalar(id: string, nome: string) {
    setOcupado(id)
    try {
      const res = await getAdapter().installSoundPack(id)
      const logId = useLogStore.getState().log({
        moduloId: 'games',
        acao: `som-instalar-${id}`,
        resultado: nome,
        reversivel: true,
        detalhes: `${res.arquivos} arquivo(s)${res.backupCriado ? ' · backup criado' : ''}`,
      })
      registerRevert(logId, async () => {
        await getAdapter().restoreSounds()
        await ler()
      })
      pushToast({ tipo: 'sucesso', mensagem: t('sndInstalou', { nome, n: res.arquivos }) })
      setArmado(false)
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      setOcupado(null)
    }
  }

  async function restaurar() {
    setOcupado('restore')
    try {
      const res = await getAdapter().restoreSounds()
      useLogStore.getState().log({
        moduloId: 'games',
        acao: 'som-restaurar',
        resultado: t('sndRestaurar'),
        reversivel: false,
        detalhes: `${res.arquivos} arquivo(s)`,
      })
      pushToast({ tipo: 'sucesso', mensagem: t('sndRestaurou', { n: res.arquivos }) })
      setArmado(false)
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      setOcupado(null)
    }
  }

  async function tocar(id: string) {
    setOcupado(`preview-${id}`)
    try {
      await getAdapter().previewSoundPack(id)
    } catch (e) {
      avisar(e, 'sndErrPrevia')
    } finally {
      setOcupado(null)
    }
  }

  const head = (
    <div className="surface-head">
      {t('sndTitulo')}
      {scan !== null && (
        <KTag variant={scan.instaladoId !== null ? 'ok' : 'estimated'}>
          {scan.instaladoId !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <IconCheck width={11} height={11} />
              {t('sndInstalado')}
            </span>
          ) : (
            t('sndNenhum')
          )}
        </KTag>
      )}
      <span className="ml-auto flex items-center gap-3">
        {scan?.origin === 'demo' && <DemoTag full />}
        <Button size="sm" disabled={ocupado !== null || scan === null} onClick={() => void ler()}>
          {t('reler')}
        </Button>
      </span>
    </div>
  )

  if (erro) {
    return (
      <Surface className="snd-card">
        {head}
        <div className="p-4">
          <ErrorState what={t('sndErroLer')} todo={t('sndErroLerAcao')} onRetry={() => void ler()} />
        </div>
      </Surface>
    )
  }
  if (scan === null) {
    return (
      <Surface className="snd-card">
        {head}
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('sndLendo')}</p>
      </Surface>
    )
  }

  const semGta = scan.gtaRaiz === null
  const semDestino = scan.geracao === null || scan.sfx === null
  const bloqueio = semGta ? t('sndBloqGta') : semDestino ? t('sndBloqGeracao') : scan.jogoAberto ? t('sndBloqJogo') : null
  const travado = bloqueio !== null
  const ocupadoGeral = ocupado !== null

  return (
    <Surface className="snd-card">
      {head}

      <div className="snd-aviso">
        <div className="hazard-bar" aria-hidden />
        <div className="snd-aviso-corpo">
          <KTag variant="critical">
            <span className="inline-flex items-center gap-1.5">
              <IconWarn width={11} height={11} />
              {t('sndAtencao')}
            </span>
          </KTag>
          <p>{t('sndPureAviso')}</p>
        </div>
      </div>

      <div className="snd-estado">
        <MetricRow label={t('sndGta')} value={scan.gtaRaiz} origin={scan.origin} />
        <MetricRow
          label={t('sndGeracao')}
          value={scan.geracao === null ? null : scan.geracao === 'legacy' ? t('sndLegacy') : t('sndEnhanced')}
        />
        <MetricRow label={t('sndSfx')} value={scan.sfx} />
        <MetricRow label={t('sndBiblioteca')} value={t('sndPacks', { n: scan.packs.length })} accent />
      </div>

      {bloqueio !== null && (
        <p className="snd-bloqueio">
          <IconWarn width={14} height={14} />
          {bloqueio}
        </p>
      )}

      <div className="snd-zona">
        <div className="snd-zona-corpo">
          <div className="snd-zona-texto">
            <span className="snd-zona-titulo">{t('sndZonaTitulo')}</span>
            <span className="fm-explica">{t('sndZonaDesc')}</span>
            <span className="snd-zona-hint">{t('fmArmeSegure')}</span>
          </div>
          <ArmSwitch armed={armado} onChange={setArmado} disabled={travado || ocupadoGeral} />
          {scan.temBackup && (
            <Button
              className="snd-hold"
              disabled={travado || ocupadoGeral}
              onClick={() => void restaurar()}
            >
              {ocupado === 'restore' ? t('sndRestaurando') : t('sndRestaurar')}
            </Button>
          )}
        </div>
      </div>

      {scan.packs.length === 0 ? (
        <p className="snd-rodape">{t('sndSemPacks')}</p>
      ) : (
        <div className="snd-lista">
          {scan.packs.map((p) => {
            const instalado = p.id === scan.instaladoId
            return (
              <div key={p.id} className="snd-linha">
                <span className="snd-nome">
                  {p.nome}
                  {instalado && (
                    <KTag variant="ok">
                      <span className="inline-flex items-center gap-1.5">
                        <IconCheck width={11} height={11} />
                        {t('sndInstalado')}
                      </span>
                    </KTag>
                  )}
                </span>
                <span className="snd-bytes type-num">{fmtBytes(p.bytes)}</span>
                {p.temPreview && (
                  <Button size="sm" disabled={ocupadoGeral} onClick={() => void tocar(p.id)}>
                    {t('sndPrevia')}
                  </Button>
                )}
                <HoldButton
                  className="snd-hold"
                  variant="danger"
                  armed={armado}
                  disabled={travado || ocupadoGeral || instalado}
                  onConfirm={() => void instalar(p.id, p.nome)}
                >
                  {ocupado === p.id ? t('sndInstalando') : t('sndInstalar')}
                </HoldButton>
              </div>
            )
          })}
        </div>
      )}

      <p className="snd-rodape">{scan.temBackup ? t('sndBackupSim') : t('sndBackupNao')}</p>
    </Surface>
  )
}
