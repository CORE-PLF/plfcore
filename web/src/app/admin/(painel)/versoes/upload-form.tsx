'use client'

import { useState } from 'react'

const MAX_BYTES = 200 * 1024 * 1024

// Envia o .exe direto para o volume e devolve o SHA-256 calculado no servidor.
// O campo CHECKSUM continua sendo preenchido à mão de propósito: é a conferência
// contra o hash que você gerou na sua máquina (Get-FileHash).
export function InstallerUpload() {
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState<{ fileName: string; sizeBytes: number; sha256: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(arquivo: File) {
    setErro(null)
    setOk(null)
    if (arquivo.size > MAX_BYTES) {
      setErro('Arquivo acima de 200 MB.')
      return
    }
    setEnviando(true)
    try {
      const res = await fetch(`/admin/versoes/upload?name=${encodeURIComponent(arquivo.name)}`, {
        method: 'POST',
        body: arquivo,
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data?.erro ?? 'Falha no envio. Tente de novo.')
        return
      }
      setOk(data)
      const campo = document.getElementById('fileName') as HTMLInputElement | null
      if (campo) campo.value = data.fileName
    } catch {
      setErro('Falha no envio. Confira a conexão e tente de novo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="sm:col-span-2">
      <label htmlFor="upload" className="type-kicker mb-1.5 block">
        ENVIAR INSTALADOR PARA O VOLUME (OPCIONAL — ATÉ 200 MB)
      </label>
      <input
        id="upload"
        type="file"
        accept=".exe"
        disabled={enviando}
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          if (arquivo) void enviar(arquivo)
        }}
        className="field"
      />
      <p className="type-mono mt-1.5 text-[11px] text-ink-3">
        {enviando
          ? 'ENVIANDO — não feche esta página.'
          : 'Já colocou o arquivo no volume por fora? Pule este campo e informe só o nome abaixo.'}
      </p>
      {erro && (
        <p role="alert" className="type-mono mt-2 text-[12px] text-signal">
          [ERRO] {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="type-mono mt-2 break-all text-[12px] text-ink-1">
          [OK] {ok.fileName} · {ok.sizeBytes.toLocaleString('pt-BR')} bytes · SHA-256 do servidor:{' '}
          {ok.sha256}
        </p>
      )}
    </div>
  )
}
