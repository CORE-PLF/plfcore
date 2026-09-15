// FiveM: diagnóstico medido + limpeza de cache + isolamento de mod.
// O que esta tela nunca faz: instalar mod. Com sv_pureLevel 1 o servidor só
// perdoa quatro caminhos de áudio, com 2 não perdoa nada, e no FiveM para GTA V
// Enhanced o pure é sempre ligado — instalar mod aqui seria impedir a pessoa de
// entrar no servidor, e ela culparia o PLF CORE, não o mod.

import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { FiveMFolder, FiveMScan } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { ScreenTitle } from '../../components/Kicker'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { DemoTag, KTag } from '../../components/Tag'
import { MetricRow } from '../../components/MetricRow'
import { StatusLED } from '../../components/StatusLED'
import { EmptyState, ErrorState } from '../../components/states'
import { kitDict } from '../../components/i18n'

import { dict } from './i18n'

const GB = 1024 ** 3
const MB = 1024 ** 2

function fmtBytes(b: number): string {
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`
  if (b >= MB) return `${Math.round(b / MB)} MB`
  return `${Math.round(b / 1024)} KB`
}

export function FivemPanel() {
  const t = useT(dict)
  const tk = useT(kitDict)

  const pushToast = useToastsStore((s) => s.push)
  const [scan, setScan] = useState<FiveMScan | null>(null)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [armado, setArmado] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      setScan(await getAdapter().scanFivem())
    } catch {
      setScan(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  function avisar(e: unknown) {
    const codigo = e instanceof Error ? e.message : ''
    pushToast({
      tipo: 'erro',
      mensagem: codigo.includes('ERR_GAME_RUNNING') ? t('fmErroAberto') : t('fmErro'),
    })
  }

  async function limpar() {
    setOcupado('cache')
    try {
      const res = await getAdapter().cleanFivemCache()
      useLogStore.getState().log({
        moduloId: 'games',
        acao: 'fivem-cache',
        resultado: fmtBytes(res.liberadoBytes),
        reversivel: false,
        detalhes: `${res.pastas} pastas · ${res.falhas} falhas`,
      })
      pushToast({ tipo: 'sucesso', mensagem: t('fmLimpou', { tamanho: fmtBytes(res.liberadoBytes) }) })
      setArmado(false)
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      setOcupado(null)
    }
  }

  async function isolar(pasta: FiveMFolder) {
    setOcupado(pasta)
    try {
      const res = await getAdapter().isolateFivemFolder(pasta)
      useLogStore.getState().log({
        moduloId: 'games',
        acao: `fivem-isolar-${pasta}`,
        resultado: `${res.movidos} movidos`,
        reversivel: false,
        detalhes: res.destino,
      })
      pushToast({ tipo: 'sucesso', mensagem: t('fmIsolou', { n: res.movidos, pasta }) })
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      setOcupado(null)
    }
  }

  const ocupadoGeral = ocupado !== null
  const instalado = scan?.instalado === true

  const header = (
    <ScreenTitle
      kicker={t('kicker')}
      title={t('titulo')}
      meta={t('meta')}
      actions={
        <>
          {scan?.origin === 'demo' && <DemoTag full />}
          {instalado && (
            <span className="pill">
              <StatusLED state="live" />
              {t('fmInstalado')}
            </span>
          )}
          <Button disabled={ocupadoGeral || scan === null} onClick={() => void ler()}>
            {t('reler')}
          </Button>
        </>
      }
    />
  )

  if (erro) {
    return (
      <>
        {header}
        <ErrorState what={t('fmErroLer')} todo={t('fmErroLerAcao')} onRetry={() => void ler()} />
      </>
    )
  }
  if (scan === null) {
    return (
      <>
        {header}
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('fmLendo')}</p>
      </>
    )
  }
  if (!scan.instalado) {
    return (
      <>
        {header}
        <EmptyState code={t('fmSemCodigo')} message={t('fmSemFiveM')} />
      </>
    )
  }

  const cacheTotal = scan.caches.reduce((s, c) => s + c.bytes, 0)
  const comCache = scan.caches.filter((c) => c.bytes > 0)
  const comMod = scan.mods.filter((m) => m.arquivos > 0)
  const vazio = cacheTotal === 0

  return (
    <>
      {header}

      <Surface className="fm-hero">
        <div className="fm-hero-topo">
          <div className="fm-hero-num">
            <span className="type-kicker">{t('fmHeroKicker')}</span>
            <strong className="type-num">{fmtBytes(cacheTotal)}</strong>
            <span className="fm-hero-pastas">
              {vazio ? t('fmZerado') : t('fmPastasConteudo', { n: comCache.length, total: scan.caches.length })}
            </span>
          </div>
          <p className="fm-hero-desc">{t('fmHeroDesc')}</p>
        </div>

        <div className="fm-distrib">
          <div className={`fm-barra ${vazio ? 'fm-barra--vazia' : ''}`} role="presentation">
            {scan.caches.map((c, i) => (
              <span
                key={c.id}
                className={`fm-cor-${i % 3}`}
                style={{ width: vazio ? 0 : `${((c.bytes / cacheTotal) * 100).toFixed(2)}%` }}
              />
            ))}
          </div>
          <ul className="fm-legenda">
            {scan.caches.map((c, i) => (
              <li key={c.id}>
                <span className="fm-legenda-nome">
                  <i className={c.bytes > 0 ? `fm-cor-${i % 3}` : 'fm-cor-off'} />
                  {c.id.toUpperCase()}
                </span>
                <span className={`type-num ${c.existe ? 'text-ink-1' : 'text-ink-4'}`}>
                  {!c.existe ? tk('naoDisponivel') : c.bytes === 0 ? t('fmVazio') : fmtBytes(c.bytes)}
                </span>
              </li>
            ))}
          </ul>
          <p className="fm-explica">{t('fmCacheNota')}</p>
        </div>
      </Surface>

      <div className="fm-colunas">
        <Surface className="fm-card">
          <div className="surface-head">
            {t('fmCliente')}
            {scan.canal !== null && <StatusLED className="ml-auto" state={scan.canal === 'production' ? 'live' : 'off'} />}
          </div>
          <div className="fm-cliente-body">
            <MetricRow label={t('fmVersao')} value={scan.versao} />
            <MetricRow label={t('fmCanal')} value={scan.canal} />
            <MetricRow label={t('fmDump')} value={scan.dumpCompleto ? t('fmDumpLigado') : t('fmDumpDesligado')} />
            <MetricRow label={t('fmCfgCliente')} value={scan.configCliente ? t('fmPresente') : null} />
            <MetricRow label={t('fmCfgGraficos')} value={scan.configGraficos ? t('fmPresente') : null} />
          </div>
          {scan.canal !== null && scan.canal !== 'production' && (
            <p className="fm-explica fm-card-rodape">{t('fmCanalAviso')}</p>
          )}
        </Surface>

        <div className="fm-coluna-dir">
          <Surface className="fm-card fm-mods">
            <div className="surface-head">
              {t('fmModsTitulo')}
              <KTag variant={comMod.length > 0 ? 'critical' : 'ok'}>
                {comMod.length > 0 ? t('fmModsAchou', { n: comMod.length }) : t('fmModsLimpo')}
              </KTag>
            </div>
            <p className="fm-explica fm-mods-explica">{t('fmPureExplica')}</p>

            <div className="fm-mods-linhas">
              {scan.mods.map((m) => (
                <div key={m.id} className="fm-mod-linha">
                  <span className="fm-mod-nome">{m.id.toUpperCase()}</span>
                  {/* pasta vazia é dado medido, não ausência de fonte: NÃO DISPONÍVEL aqui seria mentira */}
                  <span className="fm-mod-info type-num">
                    {m.arquivos === 0 ? t('fmVazio') : t('fmModConta', { n: m.arquivos, tamanho: fmtBytes(m.bytes) })}
                  </span>
                  <Button size="sm" disabled={ocupadoGeral || m.arquivos === 0} onClick={() => void isolar(m.id as FiveMFolder)}>
                    {ocupado === m.id ? t('fmIsolando') : t('fmIsolar')}
                  </Button>
                </div>
              ))}
            </div>

            <p className="fm-card-rodape fm-backup">{t('fmBackupEm', { caminho: scan.backup })}</p>
          </Surface>

          <Surface className="fm-zona">
            <div className="hazard-bar" />
            <div className="fm-zona-corpo">
              <div className="fm-zona-texto">
                <span className="fm-zona-titulo">{t('fmZonaTitulo')}</span>
                <span className="fm-explica">{t('fmZonaDesc')}</span>
                <span className="fm-zona-hint">{t('fmArmeSegure')}</span>
              </div>
              <ArmSwitch armed={armado} onChange={setArmado} disabled={vazio || ocupadoGeral} />
              <HoldButton className="fm-zona-hold" variant="danger" armed={armado} disabled={ocupadoGeral || vazio} onConfirm={() => void limpar()}>
                {vazio ? t('fmZerado') : ocupado === 'cache' ? t('fmLimpando') : t('fmZonaAcao')}
              </HoldButton>
            </div>
          </Surface>
        </div>
      </div>
    </>
  )
}
