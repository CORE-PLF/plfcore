import qrcode from 'qrcode-generator'

// QR gerado NO SERVIDOR e entregue como path de SVG — o segredo TOTP não passa
// por serviço de terceiro e a página não precisa de canvas nem de imagem externa.

export interface QrPath {
  d: string
  size: number // módulos por lado, já com a zona de silêncio
}

const QUIET = 4 // zona de silêncio exigida pela norma; sem ela o leitor erra

export function qrPath(text: string): QrPath {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`
    }
  }
  return { d, size: n + QUIET * 2 }
}
