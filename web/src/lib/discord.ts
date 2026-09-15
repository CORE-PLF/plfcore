import { db } from './db'
import { env, discordConfigured } from './env'

// Discord via REST puro (sem gateway): DM de compra, cargos e avisos.
// O painel é o canal principal — falha aqui NUNCA bloqueia a entrega.

const API = 'https://discord.com/api/v10'

async function botFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.status === 204 ? null : res.json()
}

export async function sendDm(discordUserId: string, content: string): Promise<void> {
  const channel = (await botFetch('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordUserId }),
  })) as { id: string }
  await botFetch(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function addGuildRole(discordUserId: string, roleId: string): Promise<void> {
  await botFetch(`/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`, {
    method: 'PUT',
  })
}

export async function removeGuildRole(discordUserId: string, roleId: string): Promise<void> {
  await botFetch(`/guilds/${env.DISCORD_GUILD_ID}/members/${discordUserId}/roles/${roleId}`, {
    method: 'DELETE',
  })
}

// Entrega da DM de compra — registra o resultado SEM expor a licença em log.
export async function deliverPurchaseDm(userId: string, orderId: string, licenseId: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } })
  const delivery = await db.discordDelivery.create({
    data: { userId, kind: 'dm_purchase', orderId, licenseId, status: 'PENDING' },
  })
  if (!discordConfigured() || !env.DISCORD_BOT_TOKEN || !user?.discordId) {
    await db.discordDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: user?.discordId ? 'bot não configurado' : 'Discord não vinculado' },
    })
    return
  }
  try {
    const license = await db.license.findUniqueOrThrow({ where: { id: licenseId }, include: { plan: true } })
    const validade = license.expiresAt
      ? `válida até ${license.expiresAt.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`
      : 'vitalícia'
    await sendDm(
      user.discordId,
      [
        'PAGAMENTO CONFIRMADO — RESYNC',
        `Plano: ${license.plan.name} (${validade}).`,
        `Sua licença está no painel: ${env.APP_URL}/painel/licenca`,
        'Nunca compartilhe sua chave. Nosso time nunca pede a chave por DM.',
      ].join('\n'),
    )
    await db.discordDelivery.update({ where: { id: delivery.id }, data: { status: 'SENT' } })
  } catch (err) {
    await db.discordDelivery.update({
      where: { id: delivery.id },
      data: { status: 'FAILED', error: err instanceof Error ? err.message.slice(0, 500) : 'erro' },
    })
    // não relança: a licença já está entregue no painel
  }
}
