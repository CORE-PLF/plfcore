import { NextRequest, NextResponse } from 'next/server'
import { AFFILIATE_COOKIE, registerClick } from '@/lib/affiliates'
import { env } from '@/lib/env'
import { realIp } from '@/lib/ip'

// Link de afiliado: /a/CODIGO → registra clique + cookie de 30 dias → landing.

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const result = await registerClick(code, {
    ip: realIp(req.headers) ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
    landingPage: req.nextUrl.searchParams.get('para') ?? '/',
  })
  const destino = req.nextUrl.searchParams.get('para') ?? '/'
  const res = NextResponse.redirect(new URL(destino.startsWith('/') ? destino : '/', env.APP_URL))
  if (result) {
    res.cookies.set(AFFILIATE_COOKIE, code, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: result.affiliate.windowDays * 86400,
      path: '/',
    })
  }
  return res
}
