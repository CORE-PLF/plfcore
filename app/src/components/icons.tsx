// Ícones desenhados no grid do sistema: traço 1.5, cantos retos, 16×16.
import type { SVGProps } from 'react'

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    'aria-hidden': true,
    ...props,
  } as const
}

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2.5 8.5 6 12 13.5 4" />
  </svg>
)
export const IconX = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 3l10 10M13 3L3 13" />
  </svg>
)
export const IconWarn = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 2 15 14H1L8 2Z" />
    <path d="M8 6.5v3.5M8 11.8v.7" />
  </svg>
)
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 3l6 5-6 5" />
  </svg>
)
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 8h10" />
  </svg>
)
export const IconSquare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="9" height="9" />
  </svg>
)
export const IconCrosshair = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="4.5" />
    <path d="M8 1v3M8 12v3M1 8h3M12 8h3" />
  </svg>
)
export const IconTray = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 2v7.5M5 6.5 8 9.5l3-3" />
    <path d="M2.5 13h11" />
  </svg>
)
export const IconArrow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M2 8h11M9 4l4 4-4 4" />
  </svg>
)
export const IconPlay = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4.5 2.5 13 8l-8.5 5.5V2.5Z" strokeLinejoin="round" />
  </svg>
)
export const IconBolt = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ strokeWidth: 1.7, ...p })}>
    <path d="M9 1.5 3.5 9H7l-.5 5.5L12.5 7H9l0-5.5Z" />
  </svg>
)
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </svg>
)
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5v4M8 5.2v.6" />
  </svg>
)
