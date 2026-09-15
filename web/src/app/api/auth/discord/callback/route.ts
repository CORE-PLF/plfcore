import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { audit } from '@/lib/audit'
import { AFFILIATE_COOKIE, attachAttribution } from '@/lib/affiliates'
import { createSession, currentUser } from '@/lib/session'

interface DiscordUser {
  id: string
  username: string
  email: string | null
  verified?: boolean
  avatar: string | null
  global_name?: string | null
}

export async function GET(req: NextRequest) {
  const jar = await cookies()
  const savedState = jar.get('bbx_oauth_state')?.value
  const linkMode = jar.get('bbx_oauth_link')?.value === '1'
  jar.delete('bbx_oauth_state')
  jar.delete('bbx_oauth_link')

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/entrar?erro=discord-state', env.APP_URL))
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${env.APP_URL}/api/auth/discord/callback`,
    }),
  })
  if (!tokenRes.ok) return NextResponse.redirect(new URL('/entrar?erro=discord-token', env.APP_URL))
  const token = (await tokenRes.json()) as { access_token: string }

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  })
  if (!meRes.ok) return NextResponse.redirect(new URL('/entrar?erro=discord-perfil', env.APP_URL))
  const me = (await meRes.json()) as DiscordUser

  const avatarUrl = me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png` : null
  const existingOauth = await db.oauthAccount.findUnique({
    where: { provider_providerAccountId: { provider: 'discord', providerAccountId: me.id } },
  })

  // modo vínculo: usuário logado conectando o Discord à conta atual
  if (linkMode) {
    const logged = await currentUser()
    if (!logged) return NextResponse.redirect(new URL('/entrar', env.APP_URL))
    // a mesma identidade Discord nunca assume duas contas
    if (existingOauth && existingOauth.userId !== logged.id) {
      return NextResponse.redirect(new URL('/painel/conta?erro=discord-em-uso', env.APP_URL))
    }
    const dupUser = await db.user.findUnique({ where: { discordId: me.id } })
    if (dupUser && dupUser.id !== logged.id) {
      return NextResponse.redirect(new URL('/painel/conta?erro=discord-em-uso', env.APP_URL))
    }
    await db.$transaction(async (tx) => {
      await tx.oauthAccount.upsert({
        where: { provider_providerAccountId: { provider: 'discord', providerAccountId: me.id } },
        create: { provider: 'discord', providerAccountId: me.id, userId: logged.id },
        update: {},
      })
      await tx.user.update({
        where: { id: logged.id },
        data: { discordId: me.id, discordUsername: me.username, avatarUrl: avatarUrl ?? undefined },
      })
      await audit({ actorUserId: logged.id, action: 'user.discord_link', entity: 'user', entityId: logged.id }, tx)
    })
    return NextResponse.redirect(new URL('/painel/conta?discord=vinculado', env.APP_URL))
  }

  // login/cadastro via Discord
  let userId: string
  if (existingOauth) {
    userId = existingOauth.userId
  } else {
    if (!me.email) return NextResponse.redirect(new URL('/entrar?erro=discord-sem-email', env.APP_URL))
    const email = me.email.toLowerCase()
    const byEmail = await db.user.findUnique({ where: { email } })
    if (byEmail) {
      // conta existente com este e-mail: conecta a identidade (e-mail verificado pelo Discord)
      await db.$transaction(async (tx) => {
        await tx.oauthAccount.create({
          data: { provider: 'discord', providerAccountId: me.id, userId: byEmail.id },
        })
        await tx.user.update({
          where: { id: byEmail.id },
          data: {
            discordId: me.id,
            discordUsername: me.username,
            avatarUrl: byEmail.avatarUrl ?? avatarUrl,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? (me.verified ? new Date() : null),
          },
        })
      })
      userId = byEmail.id
    } else {
      const created = await db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email,
            name: me.global_name || me.username,
            discordId: me.id,
            discordUsername: me.username,
            avatarUrl,
            emailVerifiedAt: me.verified ? new Date() : null,
          },
        })
        await tx.oauthAccount.create({
          data: { provider: 'discord', providerAccountId: me.id, userId: u.id },
        })
        await tx.legalAcceptance.create({
          data: { userId: u.id, docType: 'termos+privacidade', version: '2026-08' },
        })
        await audit({ actorUserId: u.id, action: 'user.register_discord', entity: 'user', entityId: u.id }, tx)
        return u
      })
      userId = created.id
      const ref = jar.get(AFFILIATE_COOKIE)?.value
      if (ref) await attachAttribution(userId, ref)
    }
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  if (user.status !== 'ACTIVE') return NextResponse.redirect(new URL('/entrar?erro=conta-suspensa', env.APP_URL))
  await createSession(userId)
  await audit({ actorUserId: userId, action: 'user.login_discord', entity: 'user', entityId: userId })
  return NextResponse.redirect(new URL('/painel', env.APP_URL))
}
