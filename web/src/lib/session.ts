import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import type { User } from '@/generated/prisma/client'
import { db } from './db'
import { env } from './env'
import { randomToken, sha256 } from './crypto'
import { realIp } from './ip'

const COOKIE = 'bbx_session'
const SESSION_DAYS = 30

export async function createSession(userId: string): Promise<string> {
  const token = randomToken(32)
  const h = await headers()
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      ip: realIp(h),
      userAgent: h.get('user-agent')?.slice(0, 255) ?? null,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    },
  })
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  })
  return token
}

// cache() — uma consulta por request mesmo com vários componentes pedindo o usuário
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: true },
  })
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null
  if (session.user.status !== 'ACTIVE') return null
  return session.user
})

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) {
    await db.session.updateMany({
      where: { id: sha256(token) },
      data: { revokedAt: new Date() },
    })
  }
  jar.delete(COOKIE)
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
