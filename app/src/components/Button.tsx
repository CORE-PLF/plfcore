import type { ButtonHTMLAttributes } from 'react'
import { sfx } from '../services/sfx'
import './kit.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = amarelo (uma ação por tela); ghost = contorno; danger = vermelho; secondary = cinza */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'lg' | 'md' | 'sm'
}

export function Button({ variant = 'secondary', size = 'md', className = '', onClick, ...rest }: Props) {
  return (
    <button
      className={`btn btn--${variant} ${size !== 'md' ? `btn--${size}` : ''} ${className}`}
      onClick={(e) => {
        sfx.click()
        onClick?.(e)
      }}
      {...rest}
    />
  )
}
