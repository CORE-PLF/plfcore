/** Kicker em caps com barra final colorida: `DIAGNÓSTICO /` */
export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="type-kicker">
      {children} <span className="text-signal">/</span>
    </p>
  )
}

export function ScreenTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="mb-6">
      <Kicker>{kicker}</Kicker>
      <h1 className="type-display mt-1 text-4xl">{title}</h1>
      <div className="rule-fade mt-3 w-64" />
    </header>
  )
}
