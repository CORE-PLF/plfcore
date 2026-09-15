import type { Metadata } from 'next'
import { JetBrains_Mono, Quantico, Saira_Condensed } from 'next/font/google'
import { BRAND } from '@/lib/brand'
import './globals.css'

// Saira Condensed não tem itálico verdadeiro — o .type-display usa oblíquo sintético, como no app
const saira = Saira_Condensed({
  variable: '--font-saira',
  subsets: ['latin'],
  weight: ['600', '800'],
})

const quantico = Quantico({
  variable: '--font-quantico',
  subsets: ['latin'],
  weight: ['400', '700'],
})

const jetbrains = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['500', '700', '800'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: `${BRAND.name} — Otimização que você consegue verificar`,
    template: `%s — ${BRAND.name}`,
  },
  description:
    'A Resync analisa dados reais do seu sistema, explica o que está acontecendo e mostra exatamente o que pode ser melhorado.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="pt-BR"
      className={`${saira.variable} ${quantico.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
