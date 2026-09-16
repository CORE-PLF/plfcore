// Catálogo de mods de som do GTA V: grade de cards com prévia em vídeo (COM som —
// é pack de som, prévia muda não serve), download da nuvem e instalação.
// Instalar é um clique só: o que torna isso aceitável é o backup — o caminho de volta
// (RESTAURAR ORIGINAL) fica tão visível quanto o de ida, junto do aviso de pure mode.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { registerRevert, useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { SoundCatalogPack, SoundGen, SoundsScan } from '../../types'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressBar } from '../../components/ProgressBar'
import { DemoTag, KTag } from '../../components/Tag'
import { MetricRow } from '../../components/MetricRow'
import { IconCheck, IconWarn } from '../../components/icons'
import { ErrorState } from '../../components/states'

import { dict } from './i18n'
import './sounds.css'

const MB = 1024 ** 2

function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`
  return `${Math.round(b / MB)} MB`
}

// Ordem importa: o código do backend é procurado por includes(), então o mais
// específico vem antes (ERR_MANIFEST_HTTP casaria com ERR_MANIFEST).
const ERROS = {
  ERR_SND_SEM_GTA: 'sndErrSemGta',
  ERR_SND_GERACAO: 'sndErrGeracao',
  ERR_GAME_RUNNING: 'sndBloqJogo',
  ERR_SND_SEM_BACKUP: 'sndErrSemBackup',
  ERR_SND_NAO_VANILLA: 'sndErrNaoVanilla',
  ERR_SND_PACK: 'sndErrPack',
  ERR_SND_HASH: 'sndErrHash',
  ERR_SND_COPIA: 'sndErrCopia',
  ERR_MANIFEST_HTTP: 'sndErrManifestHttp',
  ERR_MANIFEST: 'sndErrManifest',
  ERR_DOWNLOAD_HTTP: 'sndErrDownloadHttp',
  ERR_DOWNLOAD: 'sndErrDownload',
  ERR_SHA: 'sndErrSha',
  ERR_PACK_SLUG: 'sndErrPackSlug',
  ERR_PACK_ARQUIVO: 'sndErrPackArquivo',
  ERR_PACK_URL: 'sndErrPackUrl',
  ERR_CACHE_DIR: 'sndErrCacheDir',
  ERR_CACHE_ESCREVE: 'sndErrCacheEscreve',
} as const

type Msg = (typeof ERROS)[keyof typeof ERROS] | 'sndErro' | 'sndErrPrevia'

/** Sem endereço de catálogo na build, ou catálogo fora do ar: em ambos os casos a tela
 * continua servindo a biblioteca local, com selo dizendo por que o resto sumiu. */
type ModoCatalogo = 'ok' | 'sem-endereco' | 'falhou'

interface ItemPack {
  slug: string
  nome: string
  bytes: number
  /** null = pack que só existe na biblioteca local: não dá pra saber a geração dele */
  geracoes: SoundGen[] | null
  previewUrl: string | null
  capaUrl: string | null
  baixado: boolean
  temPreviewLocal: boolean
}

interface Progresso {
  fase: 'baixando' | 'conferindo'
  pct: number
}

function mesclar(catalogo: SoundCatalogPack[] | null, scan: SoundsScan): ItemPack[] {
  const locais = new Map(scan.packs.map((p) => [p.id, p]))
  const lista: ItemPack[] = (catalogo ?? []).map((c) => ({
    slug: c.slug,
    nome: c.nome,
    bytes: c.bytes,
    geracoes: c.geracao,
    previewUrl: c.previewUrl,
    capaUrl: c.capaUrl,
    baixado: locais.has(c.slug),
    temPreviewLocal: locais.get(c.slug)?.temPreview ?? false,
  }))
  const noCatalogo = new Set(lista.map((i) => i.slug))
  for (const p of locais.values()) {
    if (noCatalogo.has(p.id)) continue
    lista.push({
      slug: p.id,
      nome: p.nome,
      bytes: p.bytes,
      geracoes: null,
      previewUrl: null,
      capaUrl: null,
      baixado: true,
      temPreviewLocal: p.temPreview,
    })
  }
  return lista
}

export default function SoundsScreen() {
  const t = useT(dict)

  const pushToast = useToastsStore((s) => s.push)
  const [scan, setScan] = useState<SoundsScan | null>(null)
  const [catalogo, setCatalogo] = useState<SoundCatalogPack[] | null>(null)
  const [modo, setModo] = useState<ModoCatalogo>('ok')
  const [catalogoLendo, setCatalogoLendo] = useState(true)
  const [progresso, setProgresso] = useState<Record<string, Progresso>>({})
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // prefers-reduced-motion, ou play() recusado pela política de autoplay do webview:
  // nos dois casos a prévia passa a depender de clique, e o card mostra o botão.
  const [semAutoplay, setSemAutoplay] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  const ler = useCallback(async () => {
    setErro(false)
    try {
      setScan(await getAdapter().scanSounds())
    } catch {
      setScan(null)
      setErro(true)
      return
    }
    setCatalogoLendo(true)
    try {
      setCatalogo(await getAdapter().fetchCatalog())
      setModo('ok')
    } catch (e) {
      setCatalogo(null)
      setModo(e instanceof Error && e.message.includes('ERR_MANIFEST_NAO_CONFIGURADO') ? 'sem-endereco' : 'falhou')
    } finally {
      setCatalogoLendo(false)
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

  async function baixar(item: ItemPack) {
    const pack = catalogo?.find((c) => c.slug === item.slug)
    if (!pack) return
    const limpar = () =>
      setProgresso((p) => {
        const resto = { ...p }
        delete resto[pack.slug]
        return resto
      })
    setProgresso((p) => ({ ...p, [pack.slug]: { fase: 'baixando', pct: 0 } }))
    try {
      await getAdapter().downloadPack(pack, (ev) =>
        setProgresso((p) => ({ ...p, [ev.slug]: { fase: ev.fase, pct: ev.pct } })),
      )
      // some com a barra ANTES de reler: senão o card troca pro bloco "baixado"
      // enquanto o estado ainda diz CONFERINDO, e pisca um frame errado.
      limpar()
      useLogStore.getState().log({
        moduloId: 'sounds',
        acao: `som-baixar-${pack.slug}`,
        resultado: pack.nome,
        reversivel: false,
        detalhes: fmtBytes(pack.bytes),
      })
      pushToast({ tipo: 'sucesso', mensagem: t('sndBaixou', { nome: pack.nome }) })
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      limpar()
    }
  }

  async function remover(item: ItemPack) {
    setOcupado(item.slug)
    try {
      await getAdapter().removePack(item.slug)
      useLogStore.getState().log({
        moduloId: 'sounds',
        acao: `som-remover-${item.slug}`,
        resultado: item.nome,
        reversivel: false,
        detalhes: fmtBytes(item.bytes),
      })
      pushToast({ tipo: 'sucesso', mensagem: t('sndRemoveu', { nome: item.nome, tamanho: fmtBytes(item.bytes) }) })
      await ler()
    } catch (e) {
      avisar(e)
    } finally {
      setOcupado(null)
    }
  }

  async function instalar(id: string, nome: string) {
    setOcupado(id)
    try {
      const res = await getAdapter().installSoundPack(id)
      const logId = useLogStore.getState().log({
        moduloId: 'sounds',
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
        moduloId: 'sounds',
        acao: 'som-restaurar',
        resultado: t('sndRestaurar'),
        reversivel: false,
        detalhes: `${res.arquivos} arquivo(s)`,
      })
      pushToast({ tipo: 'sucesso', mensagem: t('sndRestaurou', { n: res.arquivos }) })
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

  const itens = useMemo(() => (scan === null ? [] : mesclar(catalogo, scan)), [catalogo, scan])

  const titulo = (
    <ScreenTitle
      kicker={t('kicker')}
      title={t('titulo')}
      meta={t('meta')}
      actions={
        <>
          {scan?.origin === 'demo' && <DemoTag full />}
          {catalogoLendo && <KTag variant="estimated">{t('sndLendoCatalogo')}</KTag>}
          {!catalogoLendo && modo !== 'ok' && <KTag variant="critical">{t('sndSemCatalogo')}</KTag>}
          <Button disabled={ocupado !== null || scan === null} onClick={() => void ler()}>
            {t('reler')}
          </Button>
        </>
      }
    />
  )

  if (erro) {
    return (
      <div className="snd-screen">
        {titulo}
        <Surface className="flex-1 p-6">
          <ErrorState what={t('sndErroLer')} todo={t('sndErroLerAcao')} onRetry={() => void ler()} />
        </Surface>
      </div>
    )
  }
  if (scan === null) {
    return (
      <div className="snd-screen">
        {titulo}
        <Surface className="flex-1">
          <p className="type-mono p-6 text-center text-xs text-ink-3">{t('sndLendo')}</p>
        </Surface>
      </div>
    )
  }

  const semGta = scan.gtaRaiz === null
  const semDestino = scan.geracao === null || scan.sfx === null
  const bloqueio = semGta ? t('sndBloqGta') : semDestino ? t('sndBloqGeracao') : scan.jogoAberto ? t('sndBloqJogo') : null
  // vanillaSumiu trava tudo: sem original guardado, instalar seria um caminho sem volta.
  const travado = bloqueio !== null || scan.vanillaSumiu
  const baixandoAlgum = Object.keys(progresso).length > 0
  const ocupadoGeral = ocupado !== null || baixandoAlgum
  const baixados = scan.packs.length
  const instalados = scan.instaladoId === null ? 0 : 1

  function card(item: ItemPack) {
    const prog = progresso[item.slug]
    const instalado = item.slug === scan!.instaladoId
    // geração null (pack só local, ou GTA sem geração detectada) nunca vira incompatível:
    // marcar sem medir seria inventar.
    const incompativel =
      item.geracoes !== null && scan!.geracao !== null && !item.geracoes.includes(scan!.geracao)
    const soPara = (item.geracoes ?? []).map((g) => (g === 'legacy' ? t('sndLegacy') : t('sndEnhanced'))).join(' / ')
    const estado = prog
      ? prog.fase === 'conferindo'
        ? t('sndConferindo')
        : t('sndBaixando', { pct: Math.round(prog.pct) })
      : instalado
        ? t('sndInstalado')
        : item.baixado
          ? t('sndBaixado')
          : t('sndNaNuvem')

    return (
      <div key={item.slug} className="snd-pack">
        <div className="snd-pack-capa">
          {item.previewUrl !== null ? (
            <video
              className="snd-pack-video"
              src={item.previewUrl}
              poster={item.capaUrl ?? undefined}
              loop
              playsInline
              preload="none"
              onMouseEnter={(e) => {
                if (semAutoplay) return
                const v = e.currentTarget
                v.volume = 0.5
                void v.play().catch(() => setSemAutoplay(true))
              }}
              onMouseLeave={(e) => {
                e.currentTarget.pause()
                e.currentTarget.currentTime = 0
              }}
            />
          ) : (
            <span className="snd-pack-sem">{t('sndSemPrevia')}</span>
          )}

          {instalado && (
            <span className="snd-pack-selo">
              <IconCheck width={11} height={11} />
              {t('sndInstalado')}
            </span>
          )}

          {item.previewUrl !== null &&
            (semAutoplay ? (
              <button
                type="button"
                className="snd-pack-play"
                onClick={(e) => {
                  const v = e.currentTarget.parentElement?.querySelector('video')
                  if (!v) return
                  v.volume = 0.5
                  if (v.paused) void v.play().catch(() => {})
                  else v.pause()
                }}
              >
                {t('sndTocar')}
              </button>
            ) : (
              <span className="snd-pack-hint">{t('sndPassarMouse')}</span>
            ))}
        </div>

        <div className="snd-pack-corpo">
          <div className="snd-pack-topo">
            <span className="snd-pack-nome">{item.nome}</span>
            <span className="snd-pack-bytes type-num">{fmtBytes(item.bytes)}</span>
          </div>

          <div className="snd-pack-estado">
            <span className={prog ? 'snd-pack-estado-vivo' : ''}>{estado}</span>
            {incompativel && (
              <KTag variant="critical">
                <span className="inline-flex items-center gap-1.5">
                  <IconWarn width={11} height={11} />
                  {t('sndIncompativel')}
                </span>
              </KTag>
            )}
          </div>

          {prog ? (
            <ProgressBar className="snd-pack-barra" pct={prog.fase === 'conferindo' ? 100 : prog.pct} />
          ) : incompativel ? (
            <p className="snd-pack-nota">{t('sndSoPara', { geracao: soPara })}</p>
          ) : scan!.vanillaSumiu && item.baixado ? (
            <p className="snd-pack-nota">{t('sndVanillaCurto')}</p>
          ) : null}

          <div className="snd-pack-acoes">
            {!item.baixado ? (
              <Button
                className="snd-pack-acao"
                size="sm"
                disabled={incompativel || ocupadoGeral || prog !== undefined}
                onClick={() => void baixar(item)}
              >
                {prog ? estado : t('sndBaixar')}
              </Button>
            ) : (
              <>
                <Button
                  className="snd-pack-acao"
                  size="sm"
                  variant="primary"
                  disabled={travado || ocupadoGeral || instalado || incompativel}
                  onClick={() => void instalar(item.slug, item.nome)}
                >
                  {ocupado === item.slug ? t('sndInstalando') : instalado ? t('sndInstalado') : t('sndInstalar')}
                </Button>
                {item.temPreviewLocal && item.previewUrl === null && (
                  <Button size="sm" disabled={ocupadoGeral} onClick={() => void tocar(item.slug)}>
                    {t('sndPrevia')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={instalado || ocupadoGeral}
                  onClick={() => void remover(item)}
                >
                  {ocupado === item.slug ? t('sndRemovendo') : t('sndRemover')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="snd-screen">
      {titulo}

      <Surface className="snd-topo">
        <div className="snd-contas">
          <span className="snd-conta">
            <b className="type-num">{modo === 'ok' && catalogo !== null ? catalogo.length : '—'}</b>
            <span>{t('sndCatalogo')}</span>
          </span>
          <span className="snd-conta">
            <b className="type-num">{baixados}</b>
            <span>{t('sndContaBaixados')}</span>
          </span>
          <span className={`snd-conta ${instalados > 0 ? 'snd-conta--vivo' : ''}`}>
            <b className="type-num">{instalados}</b>
            <span>{t('sndContaInstalados')}</span>
          </span>
        </div>
        <div className="snd-medidos">
          <div className="snd-medidos-grade">
            <MetricRow label={t('sndGta')} value={scan.gtaRaiz} origin={scan.origin} />
            <MetricRow
              label={t('sndGeracao')}
              value={scan.geracao === null ? null : scan.geracao === 'legacy' ? t('sndLegacy') : t('sndEnhanced')}
            />
            <MetricRow label={t('sndSfx')} value={scan.sfx} />
            <MetricRow label={t('sndBiblioteca')} value={scan.biblioteca} />
          </div>
          {scan.alvoOrigem !== null && (
            <span className="snd-explica">{t(scan.alvoOrigem === 'fivem' ? 'sndAlvoFivem' : 'sndAlvoInstalado')}</span>
          )}
        </div>
      </Surface>

      {scan.vanillaSumiu && (
        <Surface className="snd-aviso snd-aviso--parado">
          <div className="hazard-bar" aria-hidden />
          <div className="snd-aviso-corpo">
            <div className="snd-aviso-texto">
              <span className="snd-aviso-titulo">
                <IconWarn width={14} height={14} />
                {t('sndVanillaTitulo')}
              </span>
              <span className="snd-aviso-forte">{t('sndVanillaAviso')}</span>
            </div>
          </div>
        </Surface>
      )}

      <Surface className="snd-aviso">
        <div className="hazard-bar" aria-hidden />
        <div className="snd-aviso-corpo">
          <div className="snd-aviso-texto">
            <span className="snd-aviso-titulo">
              <IconWarn width={14} height={14} />
              {t('sndZonaTitulo')}
            </span>
            <span className="snd-explica">{t('sndZonaDesc')}</span>
            <span className="snd-explica">{t('sndPureAviso')}</span>
          </div>
          {scan.temBackup && (
            <Button className="snd-restaurar" disabled={travado || ocupadoGeral} onClick={() => void restaurar()}>
              {ocupado === 'restore' ? t('sndRestaurando') : t('sndRestaurar')}
            </Button>
          )}
        </div>
      </Surface>

      {bloqueio !== null && (
        <p className="snd-bloqueio">
          <IconWarn width={14} height={14} />
          {bloqueio}
        </p>
      )}

      {!catalogoLendo && modo !== 'ok' && (
        <p className="snd-bloqueio">
          <IconWarn width={14} height={14} />
          {modo === 'sem-endereco' ? t('sndSemCatalogoNota') : t('sndCatalogoFalhou')}
        </p>
      )}

      <Surface className="snd-catalogo">
        <div className="surface-head">
          {t('sndCatalogoHead')}
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
          {/* Sem o original guardado, a instalação está bloqueada — prometer que
              o backup nasce na primeira instalação contradiz o aviso acima. */}
          {!scan.vanillaSumiu && (
            <span className="snd-rodape ml-auto border-0 p-0">
              {scan.temBackup ? t('sndBackupSim') : t('sndBackupNao')}
            </span>
          )}
        </div>

        {itens.length === 0 ? (
          <p className="snd-vazio">
            {catalogoLendo ? t('sndLendoCatalogo') : modo === 'ok' ? t('sndCatalogoVazio') : t('sndSemPacks')}
          </p>
        ) : (
          <div className="snd-grade">{itens.map(card)}</div>
        )}
      </Surface>
    </div>
  )
}
