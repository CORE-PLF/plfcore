import type { ButtonHTMLAttributes, CSSProperties } from 'react'
import { sfx } from '../services/sfx'
import './kit.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
}

export function Button({ variant = 'ghost', size = 'md', className = '', onClick, style, ...rest }: Props) {
  return (
    <button
      className={`btn chamfer btn--${variant} ${size === 'sm' ? 'btn--sm' : ''} ${className}`}
      style={{ '--cut': size === 'sm' ? '4px' : '6px', ...style } as CSSProperties}
      onClick={(e) => {
        sfx.click()
        onClick?.(e)
      }}
      {...rest}
    />
  )
}
