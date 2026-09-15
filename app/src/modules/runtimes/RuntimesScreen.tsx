import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '../../i18n'
import { getAdapter } from '../../services/adapter'
import { useLogStore } from '../../stores/log'
import { useToastsStore } from '../../stores/toasts'
import type { RuntimeState } from '../../types'
import { Button } from '../../components/Button'
import { Surface } from '../../components/Surface'
import { ScreenTitle } from '../../components/Kicker'
import { ProgressBar } from '../../components/ProgressBar'
import { StatusLED } from '../../components/StatusLED'
import { ErrorState } from '../../components/states'
import { IconCheck } from '../../components/icons'
import { dict } from './i18n'
import type { RuntimeId } from './i18n'
import './runtimes.css'

/** Ordem de exibição: o que quebra jogo primeiro, nicho por último. */
const ORDEM: RuntimeId[] = [
  'directx',
  'vc2015-x64',
  'vc2015-x86',
  'vc2013-x64',
  'vc2013-x86',
  'vc2012-x64',
  'vc2012-x86',
  'dotnet-desktop-8',
  'netfx',
  'vc2010-x64',
  'vc2010-x86',
  'vc2008-x64',
  'vc2008-x86',
  'vc2005-x64',
  'vc2005-x86',
  'dotnet-desktop-9',
  'xna',
]

export default function RuntimesScreen() {
  const t = useT(dict)
  const pushToast = useToastsStore((s) => s.push)
  const [itens, setItens] = useState<RuntimeState[] | null>(null)
  const [winget, setWinget] = useState(true)
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [lote, setLote] = useState<{ feitos: number; total: number } | null>(null)
  // A lista aberta por padrão: a pessoa quer ver o que já tem instalado.
  const [detalhes, setDetalhes] = useState(true)
  const [reinicio, setReinicio] = useState(false)

  const ler = useCallback(async () => {
    setErro(false)
    try {
      const scan = await getAdapter().scanRuntimes()
      const peso = new Map(ORDEM.map((id, i) => [id as string, i]))
      scan.items.sort((a, b) => (peso.get(a.id) ?? 99) - (peso.get(b.id) ?? 99))
      setItens(scan.items)
      setWinget(scan.winget)
    } catch {
      setItens(null)
      setErro(true)
    }
  }, [])

  useEffect(() => {
    void ler()
  }, [ler])

  /** O lote nunca inclui OPCIONAL: são runtimes de nicho que quase nunca fazem falta. */
  const faltando = useMemo(
    () => (itens ?? []).filter((i) => !i.instalado && i.instalavel && !i.opcional),
    [itens],
  )
  const faltandoOpcional = useMemo(
    () => (itens ?? []).filter((i) => !i.instalado && i.instalavel && i.opcional),
    [itens],
  )
  const ocupadoGeral = ocupado !== null || lote !== null

  async function instalar(item: RuntimeState): Promise<boolean> {
    const nome = t(`nome.${item.id as RuntimeId}`)
    const res = await getAdapter().installRuntime(item.id)
    useLogStore.getState().log({
      moduloId: 'runtimes',
      acao: `instalar-${item.id}`,
      resultado: res.instalado ? 'instalado' : 'nao instalado',
      reversivel: false,
      detalhes: `winget ${res.codigo} · ${nome}`,
    })
    if (res.reinicio) setReinicio(true)
    setItens((old) =>
      old
        ? old.map((i) =>
            i.id === item.id
              ? { ...i, instalado: res.instalado, versao: res.versao, detalhe: res.detalhe }
              : i,
          )
        : old,
    )
    return res.instalado
  }

  async function instalarUm(item: RuntimeState) {
    setOcupado(item.id)
    try {
      const ok = await instalar(item)
      pushToast({
        tipo: ok ? 'sucesso' : 'erro',
        mensagem: ok
          ? t('okInstalado', { nome: t(`nome.${item.id as RuntimeId}`) })
          : `${t('erroInstalar')} ${t('erroInstalarAcao')}`,
      })
    } catch {
      pushToast({ tipo: 'erro', mensagem: `${t('erroInstalar')} ${t('erroInstalarAcao')}` })
    } finally {
      setOcupado(null)
    }
  }

  async function instalarFaltando() {
    const alvos = [...faltando]
    if (alvos.length === 0) return
    setLote({ feitos: 0, total: alvos.length })
    let ok = 0
    let falhas = 0
    for (const item of alvos) {
      try {
        if (await instalar(item)) ok += 1
        else falhas += 1
      } catch {
        falhas += 1
      }
      setLote((l) => (l ? { ...l, feitos: l.feitos + 1 } : l))
    }
    setLote(null)
    pushToast({
      tipo: falhas ? 'erro' : 'sucesso',
      mensagem: falhas ? t('loteParcial', { ok, falhas }) : t('loteOk', { ok }),
    })
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <ScreenTitle kicker={t('kicker')} title={t('titulo')} />

      {erro && <ErrorState what={t('erroLer')} todo={t('erroLerAcao')} onRetry={() => void ler()} />}

      {!erro && itens === null && (
        <p className="type-mono p-6 text-center text-xs text-ink-3">{t('lendo')}</p>
      )}

      {itens !== null && (
        <>
          <Surface cut={12} className="rt-hero">
            <div className="rt-hero-info">
              <span className="rt-hero-kicker">{t('heroKicker')}</span>
              <strong className="rt-hero-num type-mono">{faltando.length}</strong>
              <span className="rt-hero-desc">
                {faltando.length === 0 ? t('heroCompleto') : t('heroResumo', { n: faltando.length })}
              </span>
            </div>
            <div className="rt-hero-acao">
              {lote ? (
                <div className="rt-hero-progresso">
                  <ProgressBar pct={(lote.feitos / lote.total) * 100} segments={20} hot />
                  <span className="type-mono text-[10px] tracking-[0.12em] text-ink-3">
                    {t('loteAndamento', { feitos: lote.feitos, total: lote.total })}
                  </span>
                </div>
              ) : faltando.length === 0 ? (
                <span className="rt-hero-ok type-display">
                  <IconCheck width={16} height={16} /> {t('tudoCerto')}
                </span>
              ) : (
                <Button
                  variant="primary"
                  disabled={ocupadoGeral || !winget}
                  onClick={() => void instalarFaltando()}
                >
                  {t('instalarFaltando', { n: faltando.length })}
                </Button>
              )}
              <Button size="sm" disabled={ocupadoGeral} onClick={() => void ler()}>
                {t('reler')}
              </Button>
            </div>
          </Surface>

          {!winget && <p className="rt-aviso mt-4">{t('semWinget')}</p>}
          {reinicio && <p className="rt-aviso mt-4">{t('pedeReinicio')}</p>}
          <p className="rt-nota my-4">{t('heroNota')}</p>

          <div className="mb-4 flex justify-end">
            <Button size="sm" onClick={() => setDetalhes((d) => !d)}>
              {detalhes ? t('esconderDetalhes') : t('verDetalhes')}
            </Button>
          </div>

          {detalhes && (
            <Surface cut={8} className="p-2">
              <div className="rt-list">
                {itens.map((item) => {
                  const id = item.id as RuntimeId
                  return (
                    <div key={item.id} className={`rt-row ${item.instalado ? '' : 'rt-row--falta'}`}>
                      <span className="rt-nome">
                        {t(`nome.${id}`)}
                        {item.opcional && <i className="rt-tag">{t('opcional')}</i>}
                      </span>
                      <span className="rt-desc" title={t(`desc.${id}`)}>
                        {t(`desc.${id}`)}
                      </span>
                      <span className="rt-versao type-mono">
                        {item.instalado ? item.versao || t('presente') : item.detalhe || '—'}
                      </span>
                      {item.instalado ? (
                        <span className="rt-estado rt-estado--ok">
                          <StatusLED state="live" label="" />
                          {t('instalado')}
                        </span>
                      ) : item.instalavel ? (
                        <Button
                          size="sm"
                          disabled={ocupadoGeral || !winget}
                          onClick={() => void instalarUm(item)}
                        >
                          {ocupado === item.id ? t('instalando') : t('instalar')}
                        </Button>
                      ) : (
                        <span className="rt-estado">{t('viaWindowsUpdate')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </Surface>
          )}

          {!detalhes && faltandoOpcional.length > 0 && (
            <p className="rt-nota">{t('opcionaisFora', { n: faltandoOpcional.length })}</p>
          )}

          <p className="rt-nota mt-5">{t('nota')}</p>
        </>
      )}
    </div>
  )
}
