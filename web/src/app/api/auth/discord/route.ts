import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { env, discordConfigured } from '@/lib/env'
import { randomToken } from '@/lib/crypto'

// Início do OAuth do Discord — state anti-CSRF em cookie HttpOnly.

export async function GET(req: NextRequest) {
  if (!discordConfigured()) {
    return NextResponse.redirect(new URL('/entrar?discord=nao-configurado', env.APP_URL))
  }
  const state = randomToken(16)
  const jar = await cookies()
  jar.set('bbx_oauth_state', state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  // opcional: ?link=1 vincula à conta logada em vez de criar sessão nova
  if (req.nextUrl.searchParams.get('link') === '1') {
    jar.set('bbx_oauth_link', '1', { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' })
  }

  const url = new URL('https://discord.com/api/oauth2/authorize')
  url.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  url.searchParams.set('redirect_uri', `${env.APP_URL}/api/auth/discord/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'identify email')
  url.searchParams.set('state', state)
  return NextResponse.redirect(url)
}
