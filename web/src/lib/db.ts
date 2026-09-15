import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function makeClient(): PrismaClient {
  const url = new URL(process.env.DATABASE_URL ?? '')
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 10,
    // MySQL 8 (caching_sha2_password) sem TLS exige a troca de chave RSA;
    // sem esta flag o driver recusa a PRIMEIRA autenticação de cada usuário.
    allowPublicKeyRetrieval: true,
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? makeClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
