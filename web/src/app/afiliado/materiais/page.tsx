import { Chamfer } from '@/components/ui'
import { BRAND } from '@/lib/brand'
import { env } from '@/lib/env'
import { CopyButton } from '../forms'
import { requireApprovedAffiliate } from '../shared'

export default async function MateriaisPage() {
  const { affiliate } = await requireApprovedAffiliate()
  const link = `${env.APP_URL}/a/${affiliate.code}`

  // Textos honestos: só citam o que o app faz de verdade, sem promessa de FPS nem número inventado.
  const textos = [
    {
      titulo: 'APRESENTAÇÃO CURTA',
      corpo: `Eu uso o ${BRAND.name} para diagnosticar e otimizar meu PC. Ele mede com sensores reais, explica cada ajuste e tudo é reversível. Se quiser testar: ${link}`,
    },
    {
      titulo: 'PARA QUEM JOGA',
      corpo: `${BRAND.name}: diagnóstico do PC com dados reais (CPU, GPU, RAM, discos, temperaturas), limpeza segura de arquivos temporários e otimizações do Windows explicadas e reversíveis. Prova medida de antes e depois — sem promessa mágica. ${link}`,
    },
    {
      titulo: 'TRANSPARÊNCIA',
      corpo: `O ${BRAND.name} não inventa problema para vender solução: toda ação fica registrada no LOG e o antes/depois é medido no seu próprio PC. ${link}`,
    },
  ]

  return (
    <div className="max-w-3xl">
      <h1 className="type-display text-4xl">MATERIAIS DE DIVULGAÇÃO</h1>
      <p className="mt-3 text-[13px] text-ink-2">
        Textos prontos para copiar. Regra de ouro: divulgue só o que o produto faz de verdade.
        Prometer FPS, inventar número ou usar medo cancela comissões e suspende a conta.
      </p>

      <div className="mt-6 space-y-4">
        <Chamfer cut={8} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="type-kicker">SEU LINK</p>
            <p className="type-mono mt-1 break-all text-ink-1">{link}</p>
          </div>
          <CopyButton text={link} />
        </Chamfer>

        <Chamfer cut={8} className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="type-kicker">SEU CÓDIGO</p>
            <p className="type-mono mt-1 text-ink-1">{affiliate.code}</p>
          </div>
          <CopyButton text={affiliate.code} />
        </Chamfer>

        {textos.map((t) => (
          <Chamfer key={t.titulo} cut={8} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="type-kicker">{t.titulo}</p>
              <CopyButton text={t.corpo} />
            </div>
            <p className="mt-3 text-[13px] text-ink-2">{t.corpo}</p>
          </Chamfer>
        ))}

        <Chamfer cut={8} flat className="p-5">
          <p className="type-kicker">KITS VISUAIS — EM BREVE</p>
          <p className="mt-2 text-[13px] text-ink-3">
            Banners e imagens oficiais ainda não estão prontos, e não vamos publicar material
            improvisado. Enquanto isso, use os textos acima.
          </p>
        </Chamfer>
      </div>
    </div>
  )
}
