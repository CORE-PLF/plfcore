import type { ReactNode } from 'react'

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-4">{children}</div>
}
