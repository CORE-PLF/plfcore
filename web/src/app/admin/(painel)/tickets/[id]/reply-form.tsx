'use client'

import { useState } from 'react'
import { replyTicketAction } from '@/lib/actions/admin'

// Respostas prontas: preenchem o campo, o atendente ajusta antes de enviar.
const TEMPLATES = [
  {
    label: 'PEDIR MAIS DETALHES',
    body: 'Para investigar, precisamos de mais dados: versão do aplicativo (canto inferior da tela inicial), versão do Windows e uma captura de tela do problema. Responda aqui mesmo com essas informações.',
  },
  {
    label: 'LICENÇA NÃO ATIVA',
    body: 'Verifique se a chave foi digitada exatamente como aparece no painel (formato PLF-XXXX-...). Se o erro continuar, informe o código exibido pelo aplicativo na tela de ativação para conferirmos o status da licença.',
  },
  {
    label: 'REINSTALAÇÃO LIMPA',
    body: 'Desinstale o aplicativo pelo Painel de Controle, baixe o instalador mais recente na área "Download" do seu painel e instale de novo. As configurações e o LOG são preservados. Confirme aqui se o problema persistir.',
  },
  {
    label: 'ENCERRAMENTO',
    body: 'Sem retorno nos últimos dias, este ticket será encerrado. Se o problema voltar, abra um novo ticket com os detalhes — o histórico fica registrado.',
  },
]

export function ReplyForm({ ticketId, currentStatus }: { ticketId: string; currentStatus: string }) {
  const [body, setBody] = useState('')

  return (
    <form action={replyTicketAction} className="space-y-2">
      <input type="hidden" name="id" value={ticketId} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="template" className="type-kicker">RESPOSTA PRONTA</label>
        <select
          id="template"
          className="field max-w-xs"
          defaultValue=""
          onChange={(e) => {
            const t = TEMPLATES[Number(e.target.value)]
            if (t) setBody(t.body)
          }}
        >
          <option value="">— NENHUMA —</option>
          {TEMPLATES.map((t, i) => (
            <option key={t.label} value={i}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="body"
        required
        minLength={2}
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escreva a resposta…"
        aria-label="Resposta"
        className="field"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="status" className="type-kicker">STATUS APÓS ENVIAR</label>
        <select id="status" name="status" defaultValue="AWAITING_CUSTOMER" className="field max-w-xs" key={currentStatus}>
          <option value="AWAITING_CUSTOMER">AWAITING_CUSTOMER</option>
          <option value="AWAITING_SUPPORT">AWAITING_SUPPORT</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>
        <button type="submit" className="btn btn--primary chamfer">
          ENVIAR RESPOSTA
        </button>
      </div>
    </form>
  )
}
