import type { CSSProperties, HTMLAttributes } from 'react'
import './kit.css'

export type ChamferCut = 4 | 6 | 8 | 12

interface Props extends HTMLAttributes<HTMLDivElement> {
  /** escala de corte 4/6/8/12 — filho sempre com corte menor que o pai */
  cut?: ChamferCut
  /** chanfra os 4 cantos em vez do par diagonal */
  allCorners?: boolean
  /** cor da borda de 1px (o fundo do elemento) */
  edge?: string
  /** preenchimento do miolo */
  fill?: string
  /** miolo chapado (carbon) em vez do gradiente de painel */
  flat?: boolean
  /** colchetes de mira nos 4 cantos */
  brackets?: boolean
}

export function ChamferSurface({
  cut = 8,
  allCorners = false,
  edge,
  fill,
  flat = false,
  brackets = false,
  className = '',
  style,
  children,
  ...rest
}: Props) {
  const vars: CSSProperties = {
    ...style,
    '--cut': `${cut}px`,
    ...(edge ? { '--ch-edge': edge } : null),
    ...(fill ? { '--ch-fill': fill } : null),
  } as CSSProperties
  return (
    <div
      className={`chamfer ${allCorners ? 'chamfer--all' : ''} ${flat ? 'chamfer--flat' : ''} ${brackets ? 'brackets' : ''} ${className}`}
      style={vars}
      {...rest}
    >
      {brackets && (
        <>
          <span /><span /><span /><span />
        </>
      )}
      {children}
    </div>
  )
}
