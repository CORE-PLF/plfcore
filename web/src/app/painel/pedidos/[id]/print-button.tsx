'use client'

export function PrintButton() {
  return (
    <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>
      IMPRIMIR RECIBO
    </button>
  )
}
