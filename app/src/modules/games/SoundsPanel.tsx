// Catálogo de mods de som do GTA V: grade de cards com prévia em vídeo (COM som —
// é pack de som, prévia muda não serve), download da nuvem e instalação.
// Trocar arquivo do jogo só entra em servidor com sv_pureLevel 0 ou 1 — por isso o
// aviso de pure mode fica sempre visível, e o caminho de volta (RESTAURAR ORIGINAL)
// é tão visível quanto o de ida.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { registerRevert, useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { SoundCatalogPack, SoundGen, SoundsScan } from '../../types'
import { ArmSwitch } from '../../components/ArmSwitch'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { HoldButton } from '../../components/HoldButton'
import { ProgressBar } from '../../components/ProgressBar'
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

// Ordem importa: o código do backend é procurado por includes(), então o mais
// específico vem antes (ERR_MANIFEST_HTTP casaria com ERR_MANIFEST).
const ERROS = {
  ERR_SND_SEM_GTA: 'sndErrSemGta',
  ERR_SND_GERACAO: 'sndErrGeracao',
  ERR_GAME_RUNNING: 'sndBloqJogo',
  ERR_SND_SEM_BACKUP: 'sndErrSemBackup',
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

export function SoundsPanel() {
  const t = useT(dict)

  const pushToast = useToastsStore((s) => s.push)
  const [scan, setScan] = useState<SoundsScan | null>(null)
  const [catalogo, setCatalogo] = useState<SoundCatalogPack[] | null>(null)
  const [modo, setModo] = useState<ModoCatalogo>('ok')
  const [catalogoLendo, setCatalogoLendo] = useState(true)
  const [progresso, setProgresso] = useState<Record<string, Progresso>>({})
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [armado, setArmado] = useState(false)
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
        moduloId: 'games',
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
        moduloId: 'games',
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

  const itens = useMemo(() => (scan === null ? [] : mesclar(catalogo, scan)), [catalogo, scan])

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
      {catalogoLendo && <KTag variant="estimated">{t('sndLendoCatalogo')}</KTag>}
      {!catalogoLendo && modo !== 'ok' && <KTag variant="critical">{t('sndSemCatalogo')}</KTag>}
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
  const baixandoAlgum = Object.keys(progresso).length > 0
  const ocupadoGeral = ocupado !== null || baixandoAlgum

  function card(item: ItemPack) {
    const prog = progresso[item.slug]
    const instalado = item.slug === scan!.instaladoId
    // geração null (pack só local, ou GTA sem geração detectada) nunca vira incompatível:
    // marcar sem medir seria inventar.
    const incompativel =
      item.geracoes !== null && scan!.geracao !== null && !item.geracoes.includes(scan!.geracao)
    const soPara = item.geracoes?.[0] === 'legacy' ? t('sndLegacy') : t('sndEnhanced')
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
                <HoldButton
                  className="snd-pack-acao"
                  variant="danger"
                  armed={armado}
                  disabled={travado || ocupadoGeral || instalado || incompativel}
                  onConfirm={() => void instalar(item.slug, item.nome)}
                >
                  {ocupado === item.slug ? t('sndInstalando') : instalado ? t('sndInstalado') : t('sndInstalar')}
                </HoldButton>
                {item.temPreviewLocal && item.previewUrl === null && (
                  <Button size="sm" disabled={ocupadoGeral} onClick={() => void tocar(item.slug)}>
                    {t('sndPrevia')}
                  </Button>
                )}
                <Button
                  className="snd-pack-remover"
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
        <MetricRow
          label={t('sndCatalogo')}
          value={modo === 'ok' && catalogo !== null ? t('sndPacks', { n: catalogo.length }) : null}
        />
      </div>

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

      <div className="snd-zona">
        <div className="snd-zona-corpo">
          <div className="snd-zona-texto">
            <span className="snd-zona-titulo">{t('sndZonaTitulo')}</span>
            <span className="fm-explica">{t('sndZonaDesc')}</span>
            <span className="snd-zona-hint">{t('fmArmeSegure')}</span>
          </div>
          <ArmSwitch armed={armado} onChange={setArmado} disabled={travado || ocupadoGeral} />
          {scan.temBackup && (
            <Button className="snd-hold" disabled={travado || ocupadoGeral} onClick={() => void restaurar()}>
              {ocupado === 'restore' ? t('sndRestaurando') : t('sndRestaurar')}
            </Button>
          )}
        </div>
      </div>

      {itens.length === 0 ? (
        <p className="snd-rodape">{catalogoLendo ? t('sndLendoCatalogo') : modo === 'ok' ? t('sndCatalogoVazio') : t('sndSemPacks')}</p>
      ) : (
        <div className="snd-grade">{itens.map(card)}</div>
      )}

      <p className="snd-rodape">{scan.temBackup ? t('sndBackupSim') : t('sndBackupNao')}</p>
    </Surface>
  )
}
