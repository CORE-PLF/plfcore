import { BRAND } from '../../brand'
import type { HardwareInventory, MachineRecord } from '../../types'

const BG = '#101010'
const SIGNAL = '#F8E800'
const BLOOD = '#E5262B'
const INK = '#ffffff'
const INK3 = '#8a8a8a'

const mono = (px: number, w = 700) => `${w} ${px}px "JetBrains Mono", monospace`
const display = (px: number) => `700 ${px}px Inter, sans-serif`

function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s
  let out = s
  while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1)
  return `${out}…`
}

/** Blueprint simplificado em traço — desenha só o que o inventário tem. */
function miniBlueprint(g: CanvasRenderingContext2D, inv: HardwareInventory, x: number, y: number): void {
  g.save()
  g.translate(x, y)
  g.lineWidth = 1.5
  g.strokeStyle = SIGNAL
  // placa com chanfro
  g.beginPath()
  g.moveTo(0, 0)
  g.lineTo(440, 0)
  g.lineTo(440, 360)
  g.lineTo(18, 360)
  g.lineTo(0, 342)
  g.closePath()
  g.stroke()
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  // soquete + cpu
  g.strokeRect(96, 44, 120, 120)
  g.strokeRect(114, 62, 84, 84)
  // slots de RAM conforme sticks
  inv.memoria.sticks.forEach((s, i) => {
    const sx = 252 + i * 24
    if (s.ocupado) {
      g.fillStyle = 'rgba(255,77,46,0.22)'
      g.fillRect(sx, 36, 12, 150)
    }
    g.strokeRect(sx, 36, 12, 150)
  })
  // ATX
  g.strokeRect(408, 70, 18, 100)
  // chipset
  g.strokeStyle = BLOOD
  g.strokeRect(320, 220, 60, 60)
  // M.2 por disco NVMe
  inv.discos.filter((d) => d.tipo === 'NVMe').forEach((_, n) => {
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.strokeRect(96, 196 + n * 22, 130, 8)
  })
  // PCIe + GPU
  g.strokeStyle = SIGNAL
  g.strokeRect(40, 268, 210, 8)
  g.strokeStyle = 'rgba(255,255,255,0.55)'
  g.strokeRect(34, 288, 224, 56)
  for (const cx of [96, 186]) {
    g.beginPath()
    g.arc(cx, 316, 20, 0, Math.PI * 2)
    g.stroke()
  }
  g.restore()
}

export interface CardLine {
  label: string
  value: string
}

interface CardLabels {
  demo: string
  emServico: string
  assinatura: string
}

/** Ficha da máquina 1200×675 — retorna dataURL PNG. */
export async function gerarFichaPng(
  inv: HardwareInventory,
  rec: MachineRecord,
  lines: CardLine[],
  labels: CardLabels,
): Promise<string> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 675
  const g = canvas.getContext('2d')
  if (!g) throw new Error('canvas-2d')

  g.fillStyle = BG
  g.fillRect(0, 0, 1200, 675)

  // grid técnico 24px
  g.strokeStyle = 'rgba(255,255,255,0.035)'
  g.lineWidth = 1
  for (let x = 24; x < 1200; x += 24) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, 675)
    g.stroke()
  }
  for (let y = 24; y < 675; y += 24) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(1200, y)
    g.stroke()
  }

  // moldura chanfrada
  g.strokeStyle = BLOOD
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(28, 12)
  g.lineTo(1188, 12)
  g.lineTo(1188, 647)
  g.lineTo(1172, 663)
  g.lineTo(12, 663)
  g.lineTo(12, 28)
  g.closePath()
  g.stroke()

  // cabeçalho: marca
  g.fillStyle = INK
  g.font = display(30)
  g.fillText(BRAND.name, 40, 58)
  g.fillStyle = SIGNAL
  const brandW = g.measureText(BRAND.name).width
  g.font = display(30)
  g.fillText('/', 48 + brandW, 58)
  g.font = mono(13)
  g.fillStyle = INK3
  const dataIso = new Date().toISOString().slice(0, 10)
  g.textAlign = 'right'
  g.fillText(dataIso, 1160, 54)
  g.textAlign = 'left'

  // hostname + linha de serviço
  g.fillStyle = INK
  g.font = display(62)
  g.fillText(fit(g, rec.hostname.toUpperCase(), 720), 40, 138)
  g.font = mono(14)
  g.fillStyle = BLOOD
  g.fillText(
    `${labels.emServico} ${rec.emServicoDesde}  //  ${labels.assinatura} ${rec.assinatura.toUpperCase()}`,
    42,
    168,
  )

  miniBlueprint(g, inv, 60, 220)

  // specs à direita
  let sy = 240
  for (const l of lines) {
    g.font = mono(11)
    g.fillStyle = INK3
    g.fillText(l.label, 580, sy)
    g.font = mono(19)
    g.fillStyle = INK
    g.fillText(fit(g, l.value, 560), 580, sy + 24)
    sy += 58
  }

  // rodapé
  g.strokeStyle = 'rgba(255,255,255,0.14)'
  g.beginPath()
  g.moveTo(40, 622)
  g.lineTo(1160, 622)
  g.stroke()
  g.font = mono(12)
  g.fillStyle = INK3
  g.fillText(BRAND.versionLine, 40, 644)
  g.textAlign = 'right'
  g.fillText('1200×675 // PNG', 1160, 644)
  g.textAlign = 'left'

  // selo de honestidade
  if (inv.origin === 'demo') {
    g.save()
    g.translate(985, 105)
    g.rotate(-0.1)
    g.font = mono(18)
    g.strokeStyle = SIGNAL
    g.fillStyle = SIGNAL
    const w = g.measureText(labels.demo).width
    g.strokeRect(-w / 2 - 14, -22, w + 28, 40)
    g.textAlign = 'center'
    g.fillText(labels.demo, 0, 4)
    g.restore()
  }

  return canvas.toDataURL('image/png')
}
