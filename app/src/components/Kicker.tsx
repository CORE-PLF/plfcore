/** Kicker em caps: `SISTEMA /` */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="type-kicker">{children} /</p>
}

/**
 * Cabeçalho de tela: kicker + título 34px + linha de contexto + ações à direita.
 * `meta` = frase curta em cinza ("3 instrumentos · telemetria de 60 s"); `actions` = selos e botões.
 */
export function ScreenTitle({ kicker, title, meta, actions }: { kicker: string; title: string; meta?: string; actions?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-end gap-5">
      <div className="flex flex-col gap-1">
        <Kicker>{kicker}</Kicker>
        <h1 className="type-display text-[34px]">{title}</h1>
      </div>
      {meta && <span className="mb-1 text-[13px] text-ink-3">{meta}</span>}
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </header>
  )
}
