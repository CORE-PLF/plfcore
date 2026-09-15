// Registra o slash command /minhalicenca no servidor (guild) do Discord.
// Uso: npx tsx scripts/register-discord-commands.ts
import 'dotenv/config'

async function main(): Promise<void> {
  const clientId = process.env.DISCORD_CLIENT_ID
  const guildId = process.env.DISCORD_GUILD_ID
  const token = process.env.DISCORD_BOT_TOKEN
  if (!clientId || !guildId || !token) {
    console.error('Faltou variável de ambiente. Necessárias: DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_BOT_TOKEN.')
    process.exit(1)
  }

  const commands = [
    {
      name: 'minhalicenca',
      description: 'Consulta o status da sua licença (resposta visível só para você).',
      type: 1,
    },
  ]

  const res = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  })
  if (!res.ok) {
    console.error(`Falha ao registrar comandos — Discord ${res.status}: ${(await res.text()).slice(0, 500)}`)
    process.exit(1)
  }
  console.log('Comando /minhalicenca registrado no servidor.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
