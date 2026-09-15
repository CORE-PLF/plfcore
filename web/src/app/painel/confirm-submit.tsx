'use client'

import type { ReactNode } from 'react'

// Botão de submit com confirmação nativa — para ações destrutivas do painel.
export function ConfirmSubmit({
  message,
  children,
  className = 'btn btn--danger btn--sm',
}: {
  message: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault()
      }}
    >
      {children}
    </button>
  )
}
