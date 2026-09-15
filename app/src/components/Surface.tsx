import type { CSSProperties, HTMLAttributes } from 'react'
import './kit.css'

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** cor da borda de 1px */
  edge?: string
  /** preenchimento */
  fill?: string
  /** fundo carbon (barras) em vez de steel (card) */
  flat?: boolean
  /** legado do chanfro — ignorado; módulos removem no redesign */
  cut?: number
  allCorners?: boolean
  brackets?: boolean
}

/** Card do sistema: fundo steel, borda 1px edge, raio 10. */
export function Surface({ edge, fill, flat = false, cut: _cut, allCorners: _all, brackets: _br, className = '', style, children, ...rest }: Props) {
  const vars: CSSProperties = {
    ...style,
    ...(edge ? { '--ch-edge': edge } : null),
    ...(fill ? { '--ch-fill': fill } : null),
  } as CSSProperties
  return (
    <div className={`surface ${flat ? 'surface--flat' : ''} ${className}`} style={vars} {...rest}>
      {children}
    </div>
  )
}
