// FiveM: diagnóstico medido + limpeza de cache + isolamento de mod.
// O que esta tela nunca faz: instalar mod. Com sv_pureLevel 1 o servidor só
// perdoa quatro caminhos de áudio, com 2 não perdoa nada, e no FiveM para GTA V
// Enhanced o pure é sempre ligado — instalar mod aqui seria impedir a pessoa de
// entrar no servidor, e ela culparia o RESYNC, não o mod.

import { useCallback, useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { FiveMFolder, FiveMScan } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { ChamferSurface } from '../../components/ChamferSurface'
import { HoldButton } from '../../components/HoldButton'
import { KTag } from '../../components/Tag'
import { MetricRow } from '../../components/MetricRow'
import { StatusLED } from '../../components/StatusLED'
import { EmptyState, ErrorState } from '../../components/states'
import { kitDict } from '../../components/i18n'

import { dict } from './i18n'

const GB = 1024 ** 3
const MB = 1024 ** 2
/** Blocos da barra de distribuição (8px, gap 2px — nunca lisa). */
const BLOCOS = 40

function fmtBytes(b: number): string {
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`
  if (b >= MB) return `${Math.round(b / MB)} MB`
  return `${Math.round(b / 1024)} KB`
}

/**
 * Reparte BLOCOS entre as pastas na proporção do tamanho. Pasta com conteúdo
 * nunca fica sem bloco (senão some da barra), e a soma fecha exatamente em
 * BLOCOS — sobra/falta é acertada na maior fatia, que é onde menos distorce.
 */
function repartir(bytes: number[], total: number): number[] {
  if (bytes.length === 0 || total <= 0) return bytes.map(() => 0)
  const blocos = bytes.map((b) => (b > 0 ? Math.max(1, Math.round((b / total) * BLOCOS)) : 0))
  let sobra = BLOCOS - blocos.reduce((s, n) => s + n, 0)
  while (sobra !== 0) {
    const maior = blocos.indexOf(Math.max(...blocos))
    const passo = sobra > 0 ? 1 : -1
    if (blocos[maior] + passo < 1) break
    blocos[maior] += passo
    sobra -= passo
  }
  return blocos
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

  if (erro) {
    return <ErrorState what={t('fmErroLer')} todo={t('fmErroLerAcao')} onRetry={() => void ler()} />
  }
  if (scan === null) {
    return <p className="type-mono p-6 text-center text-xs text-ink-3">{t('fmLendo')}</p>
  }
  if (!scan.instalado) {
    return (
      <div className="mt-4">
        <EmptyState code={t('fmSemCodigo')} message={t('fmSemFiveM')} action={<Button onClick={() => void ler()}>{t('reler')}</Button>} />
      </div>
    )
  }

  const cacheTotal = scan.caches.reduce((s, c) => s + c.bytes, 0)
  const comCache = scan.caches.filter((c) => c.bytes > 0)
  const blocos = repartir(scan.caches.map((c) => c.bytes), cacheTotal)
  const comMod = scan.mods.filter((m) => m.arquivos > 0)
  const ocupadoGeral = ocupado !== null
  const vazio = cacheTotal === 0

  return (
    <>
      <ChamferSurface cut={12} className="fm-hero mt-4">
        <div className="fm-hero-topo">
          <div className="fm-hero-num">
            <span className="fm-hero-kicker">{t('fmHeroKicker')}</span>
            <strong className="type-mono">{fmtBytes(cacheTotal)}</strong>
            <span className="fm-hero-pastas type-mono">
              {vazio ? t('fmZerado') : t('fmPastasConteudo', { n: comCache.length, total: scan.caches.length })}
            </span>
          </div>
          <p className="fm-hero-desc">{t('fmHeroDesc')}</p>
          <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
            {t('reler')}
          </Button>
        </div>

        <div className="fm-distrib">
          <span className="fm-distrib-rot type-mono">{t('fmCaches')}</span>
          <div className="fm-barra" role="presentation">
            {scan.caches.flatMap((c, i) =>
              Array.from({ length: blocos[i] }, (_, n) => (
                <i key={`${c.id}-${n}`} className={`fm-bloco fm-bloco--${i % 3}`} />
              )),
            )}
            {Array.from({ length: vazio ? BLOCOS : 0 }, (_, n) => (
              <i key={`off-${n}`} className="fm-bloco" />
            ))}
          </div>
          <ul className="fm-legenda">
            {scan.caches.map((c, i) => (
              <li key={c.id}>
                <i className={c.bytes > 0 ? `fm-bloco fm-bloco--${i % 3}` : 'fm-bloco'} />
                <span className="fm-legenda-nome">{c.id.toUpperCase()}</span>
                <span className={`type-mono ${c.existe ? 'text-ink-1' : 'text-ink-4'}`}>
                  {!c.existe ? tk('naoDisponivel') : c.bytes === 0 ? t('fmVazio') : fmtBytes(c.bytes)}
                </span>
              </li>
            ))}
          </ul>
          <p className="cfg-explica mt-3">{t('fmCacheNota')}</p>
        </div>
      </ChamferSurface>

      <div className="fm-colunas">
        <ChamferSurface cut={6} flat className="p-4">
          <div className="cfg-head mb-2">
            <p className="type-kicker text-ink-2">{t('fmCliente')}</p>
            {scan.canal !== null && <StatusLED state={scan.canal === 'production' ? 'white' : 'heat'} />}
          </div>
          <MetricRow label={t('fmVersao')} value={scan.versao} />
          <MetricRow label={t('fmCanal')} value={scan.canal} />
          <MetricRow label={t('fmDump')} value={scan.dumpCompleto ? t('fmDumpLigado') : t('fmDumpDesligado')} />
          <MetricRow label={t('fmCfgCliente')} value={scan.configCliente ? t('fmPresente') : null} />
          <MetricRow label={t('fmCfgGraficos')} value={scan.configGraficos ? t('fmPresente') : null} />
          {scan.canal !== null && scan.canal !== 'production' && (
            <p className="cfg-explica mt-3">{t('fmCanalAviso')}</p>
          )}
        </ChamferSurface>

        <ChamferSurface cut={6} flat className="fm-mods">
        <div className="cfg-head">
          <span className="game-name">{t('fmModsTitulo')}</span>
          <KTag variant={comMod.length > 0 ? 'critical' : 'ok'}>
            {comMod.length > 0 ? t('fmModsAchou', { n: comMod.length }) : t('fmModsLimpo')}
          </KTag>
        </div>
        <p className="cfg-explica">{t('fmPureExplica')}</p>

        {scan.mods.map((m) => (
          <div key={m.id} className="fm-mod-linha">
            <span className="cfg-chave">{m.id.toUpperCase()}</span>
            {/* pasta vazia é dado medido, não ausência de fonte: NÃO DISPONÍVEL aqui seria mentira */}
            <span className="type-mono text-xs text-ink-2">
              {m.arquivos === 0 ? t('fmVazio') : t('fmModConta', { n: m.arquivos, tamanho: fmtBytes(m.bytes) })}
            </span>
            <Button size="sm" disabled={ocupadoGeral || m.arquivos === 0} onClick={() => void isolar(m.id as FiveMFolder)}>
              {ocupado === m.id ? t('fmIsolando') : t('fmIsolar')}
            </Button>
          </div>
        ))}

        <p className="cfg-backup type-mono mt-3">{t('fmBackupEm', { caminho: scan.backup })}</p>
        </ChamferSurface>
      </div>

      <div className="game-zona-limpeza hazard">
        <div className="game-zona-texto">
          <p className="type-display text-lg">{t('fmZonaTitulo')}</p>
          <p className="cfg-explica">{t('fmZonaDesc')}</p>
        </div>
        <div className="game-zona-acao">
          <ArmSwitch armed={armado} onChange={setArmado} disabled={vazio} />
          <HoldButton variant="danger" disabled={!armado || ocupadoGeral || vazio} onConfirm={() => void limpar()}>
            {ocupado === 'cache' ? t('fmLimpando') : t('fmZonaAcao')}
          </HoldButton>
        </div>
      </div>

      <p className="game-nota mt-4">{t('fmNota')}</p>
    </>
  )
}
