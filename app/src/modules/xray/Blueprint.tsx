import type { KeyboardEvent, ReactNode } from 'react'
import type { HardwareInventory } from '../../types'
import './xray.css'

export type SectionId =
  | 'cpu'
  | 'board'
  | 'memory'
  | 'gpu'
  | 'network'
  | 'monitors'
  | 'audio'
  | 'power'
  | 'peripherals'
  | 'os'
  | `disk-${number}`

interface Box {
  x: number
  y: number
  w: number
  h: number
}

interface PartProps {
  id: SectionId
  num: string
  box: Box
  badge: { x: number; y: number }
  aria: string
  active: boolean
  selected: boolean
  ghost?: boolean
  ghostLabel?: string
  onHot: (id: SectionId | null) => void
  onPick: (id: SectionId) => void
  children: ReactNode
}

function Brackets({ b }: { b: Box }) {
  const o = 5
  const L = 12
  const x1 = b.x - o
  const y1 = b.y - o
  const x2 = b.x + b.w + o
  const y2 = b.y + b.h + o
  return (
    <g className="bp-brackets" aria-hidden>
      <path d={`M${x1} ${y1 + L} V${y1} H${x1 + L}`} />
      <path d={`M${x2 - L} ${y1} H${x2} V${y1 + L}`} />
      <path d={`M${x2} ${y2 - L} V${y2} H${x2 - L}`} />
      <path d={`M${x1 + L} ${y2} H${x1} V${y2 - L}`} />
    </g>
  )
}

/** Componente interativo do diagrama: hover acende, Enter/clique fixa a seleção. */
function Part({ id, num, box, badge, aria, active, selected, ghost, ghostLabel, onHot, onPick, children }: PartProps) {
  // ponto onde a linha do badge encosta na caixa
  const tx = Math.max(box.x, Math.min(badge.x, box.x + box.w))
  const ty = Math.max(box.y, Math.min(badge.y, box.y + box.h))
  return (
    <g
      data-bp={id}
      className={`bp-part ${ghost ? 'bp-ghost' : ''}`}
      data-active={active ? 'true' : undefined}
      role="button"
      tabIndex={0}
      aria-label={`${num} — ${aria}`}
      aria-pressed={selected}
      onMouseEnter={() => onHot(id)}
      onMouseLeave={() => onHot(null)}
      onFocus={() => onHot(id)}
      onBlur={() => onHot(null)}
      onClick={() => onPick(id)}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPick(id)
        }
      }}
    >
      <rect className="bp-hit" x={box.x} y={box.y} width={box.w} height={box.h} />
      {children}
      {ghost && ghostLabel && (
        <text className="bp-text bp-text--dim" x={box.x + box.w / 2} y={box.y + box.h + 12} textAnchor="middle" fontSize={8}>
          {ghostLabel}
        </text>
      )}
      <g className="bp-badge" aria-hidden>
        <line x1={badge.x} y1={badge.y} x2={tx} y2={ty} />
        <rect x={badge.x - 9} y={badge.y - 9} width={18} height={18} />
        <text x={badge.x} y={badge.y + 3.5}>{num}</text>
      </g>
      {selected && <Brackets b={box} />}
    </g>
  )
}

interface BlueprintProps {
  inv: HardwareInventory
  active: SectionId | null
  selected: SectionId | null
  numOf: (id: SectionId) => string
  ariaOf: (id: SectionId) => string
  livre: string
  naoDetectado: string
  ariaDiagram: string
  onHot: (id: SectionId | null) => void
  onPick: (id: SectionId) => void
}

/**
 * Placa-mãe em vista superior, estilo manual de manutenção: traço 1px, cotas,
 * callouts numerados. Só desenha o que o inventário tem.
 */
export function Blueprint({ inv, active, selected, numOf, ariaOf, livre, naoDetectado, ariaDiagram, onHot, onPick }: BlueprintProps) {
  const part = (id: SectionId, box: Box, badge: { x: number; y: number }, ghost: boolean, children: ReactNode) => (
    <Part
      key={id}
      id={id}
      num={numOf(id)}
      box={box}
      badge={badge}
      aria={ariaOf(id)}
      active={active === id}
      selected={selected === id}
      ghost={ghost}
      ghostLabel={ghost ? naoDetectado : undefined}
      onHot={onHot}
      onPick={onPick}
    >
      {children}
    </Part>
  )

  const sticks = inv.memoria.sticks
  const memW = Math.max(sticks.length, 2) * 30 + 12
  const nvme = inv.discos.filter((d) => d.tipo === 'NVMe')
  const sata = inv.discos.filter((d) => d.tipo !== 'NVMe')

  return (
    <svg viewBox="0 0 720 580" className="bp" role="group" aria-label={ariaDiagram}>
      {/* cotas — identificação real da placa, não medida inventada */}
      <g className="bp-cota" aria-hidden>
        <line x1={116} y1={16} x2={640} y2={16} />
        <line x1={116} y1={11} x2={116} y2={21} />
        <line x1={640} y1={11} x2={640} y2={21} />
        <text x={378} y={12}>{(inv.board.modelo ?? naoDetectado).toUpperCase()}</text>
        <line x1={104} y1={32} x2={104} y2={548} />
        <line x1={99} y1={32} x2={109} y2={32} />
        <line x1={99} y1={548} x2={109} y2={548} />
        <text transform="rotate(-90 96 290)" x={96} y={290}>{(inv.board.fabricante ?? naoDetectado).toUpperCase()}</text>
      </g>

      {/* contorno da placa + furos de fixação */}
      <path className="bp-board" d="M116 32 H640 V548 H136 L116 528 Z" />
      <g aria-hidden>
        {[[132, 48], [624, 48], [624, 532], [152, 532], [380, 300]].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} className="bp-deco" cx={cx} cy={cy} r={4} />
        ))}
      </g>

      {/* EPS 8 pinos — detalhe estrutural */}
      <g className="bp-deco" aria-hidden>
        <rect x={232} y={40} width={64} height={18} />
        {[1, 2, 3].map((i) => (
          <line key={i} x1={232 + i * 16} y1={40} x2={232 + i * 16} y2={58} />
        ))}
        <text className="bp-text bp-text--dim" x={304} y={53} fontSize={8}>EPS 8</text>
      </g>

      {/* CMOS + header de painel frontal — decorativos */}
      <g className="bp-deco" aria-hidden>
        <circle cx={466} cy={318} r={14} />
        <text className="bp-text bp-text--dim" x={466} y={321} textAnchor="middle" fontSize={6}>CMOS</text>
        <rect x={300} y={534} width={80} height={10} />
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={i} x1={300 + i * 10} y1={534} x2={300 + i * 10} y2={544} />
        ))}
      </g>

      {/* painel traseiro: USB → periféricos */}
      {part('peripherals', { x: 136, y: 64, w: 64, h: 84 }, { x: 214, y: 74 }, false, (
        <>
          <rect className="bp-line" x={136} y={64} width={64} height={84} />
          <rect className="bp-line" x={148} y={76} width={40} height={18} />
          <rect className="bp-faint" x={153} y={81} width={30} height={8} />
          <rect className="bp-line" x={148} y={102} width={40} height={18} />
          <rect className="bp-faint" x={153} y={107} width={30} height={8} />
          <text className="bp-text" x={168} y={138} textAnchor="middle">USB</text>
        </>
      ))}

      {/* painel traseiro: LAN → rede */}
      {part('network', { x: 136, y: 160, w: 64, h: 64 }, { x: 214, y: 170 }, false, (
        <>
          <rect className="bp-line" x={136} y={160} width={64} height={64} />
          <rect className="bp-line" x={150} y={172} width={36} height={26} />
          <rect className="bp-faint" x={160} y={198} width={16} height={6} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} className="bp-faint" x1={157 + i * 8} y1={172} x2={157 + i * 8} y2={178} />
          ))}
          <text className="bp-text" x={168} y={216} textAnchor="middle">LAN</text>
        </>
      ))}

      {/* painel traseiro: saídas de vídeo → monitores */}
      {part('monitors', { x: 136, y: 236, w: 64, h: 64 }, { x: 214, y: 246 }, inv.monitores.length === 0, (
        <>
          <rect className="bp-line" x={136} y={236} width={64} height={64} />
          <path className="bp-line" d="M150 250 h36 v12 l-8 8 h-20 l-8 -8 z" />
          <path className="bp-line" d="M150 278 h26 v10 h-22 l-4 -4 z" />
          <text className="bp-text" x={168} y={296} textAnchor="middle" fontSize={7}>DP/HDMI</text>
        </>
      ))}

      {/* painel traseiro: jacks → áudio */}
      {part('audio', { x: 136, y: 312, w: 64, h: 56 }, { x: 214, y: 322 }, inv.audio.saidaPadrao === null && inv.audio.dispositivos.length === 0, (
        <>
          <rect className="bp-line" x={136} y={312} width={64} height={56} />
          {[152, 168, 184].map((cx) => (
            <g key={cx}>
              <circle className="bp-line" cx={cx} cy={332} r={7} />
              <circle className="bp-faint" cx={cx} cy={332} r={2} />
            </g>
          ))}
          <text className="bp-text" x={168} y={358} textAnchor="middle">AUDIO</text>
        </>
      ))}

      {/* soquete + CPU */}
      {part('cpu', { x: 240, y: 88, w: 160, h: 160 }, { x: 414, y: 78 }, false, (
        <>
          <rect className="bp-line" x={240} y={88} width={160} height={160} />
          <rect className="bp-line bp-fill" x={264} y={112} width={112} height={112} />
          <line className="bp-line" x1={264} y1={124} x2={276} y2={112} />
          <circle className="bp-faint" cx={256} cy={104} r={2} />
          <line className="bp-faint" x1={404} y1={148} x2={412} y2={148} />
          <line className="bp-faint" x1={404} y1={188} x2={412} y2={188} />
          <text className="bp-text" x={320} y={172} textAnchor="middle">{inv.cpu.soquete.toUpperCase()}</text>
        </>
      ))}

      {/* slots de RAM — ocupados acesos, vazios tracejados LIVRE */}
      {part('memory', { x: 444, y: 56, w: memW, h: 240 }, { x: 432, y: 44 }, sticks.length === 0, (
        <>
          {sticks.map((s, i) => {
            const x = 450 + i * 30
            return (
              <g key={s.slot}>
                <rect className={s.ocupado ? 'bp-heat' : 'bp-dash'} x={x} y={64} width={16} height={224} />
                {s.ocupado && <line className="bp-faint" x1={x + 8} y1={70} x2={x + 8} y2={282} />}
                <text
                  className={`bp-text ${s.ocupado ? '' : 'bp-text--dim'}`}
                  transform={`rotate(90 ${x + 12} ${y0RAM})`}
                  x={x + 12}
                  y={y0RAM}
                  fontSize={8}
                >
                  {s.ocupado ? s.slot.toUpperCase() : livre}
                </text>
              </g>
            )
          })}
          {sticks.length === 0 && (
            <>
              <rect className="bp-dash" x={450} y={64} width={16} height={224} />
              <rect className="bp-dash" x={480} y={64} width={16} height={224} />
            </>
          )}
        </>
      ))}

      {/* conector ATX 24 → energia */}
      {part('power', { x: 598, y: 120, w: 26, h: 144 }, { x: 586, y: 106 }, false, (
        <>
          <rect className="bp-line" x={598} y={120} width={26} height={144} />
          {Array.from({ length: 12 }, (_, r) => (
            <g key={r}>
              <rect className="bp-faint" x={601} y={124 + r * 11.5} width={9} height={7} />
              <rect className="bp-faint" x={612} y={124 + r * 11.5} width={9} height={7} />
            </g>
          ))}
          <text className="bp-text" transform="rotate(-90 590 192)" x={590} y={192} textAnchor="middle" fontSize={8}>ATX 24</text>
        </>
      ))}

      {/* chipset → placa-mãe */}
      {part('board', { x: 480, y: 368, w: 88, h: 88 }, { x: 468, y: 356 }, false, (
        <>
          <rect className="bp-line" x={480} y={368} width={88} height={88} />
          {[0, 1, 2, 3].map((i) => (
            <line key={i} className="bp-faint" x1={488 + i * 20} y1={448} x2={508 + i * 20} y2={376} />
          ))}
          <text className="bp-text" x={524} y={470} textAnchor="middle" fontSize={8}>{(inv.board.chipset ?? naoDetectado).toUpperCase()}</text>
        </>
      ))}

      {/* M.2 — um por disco NVMe */}
      {nvme.map((d, n) => {
        const y = 304 + n * 34
        const idx = inv.discos.indexOf(d)
        // badges alternam acima/abaixo do slot: não colidem entre si nem com o badge do áudio
        return part(`disk-${idx}`, { x: 236, y: y - 4, w: 196, h: 26 }, { x: 222, y: n === 0 ? y - 10 : y + 14 }, false, (
          <>
            <rect className="bp-line" x={240} y={y} width={16} height={16} />
            <rect className="bp-line" x={256} y={y + 3} width={140} height={10} />
            <circle className="bp-line" cx={404} cy={y + 8} r={5} />
            <line className="bp-faint" x1={401} y1={y + 5} x2={407} y2={y + 11} />
            <text className="bp-text" x={414} y={y + 11} fontSize={8}>{`M.2_${n + 1}`}</text>
          </>
        ))
      })}
      {inv.discos.length === 0 && (
        <g className="bp-ghost" aria-hidden>
          <rect className="bp-line" x={240} y={304} width={16} height={16} />
          <rect className="bp-line" x={256} y={307} width={140} height={10} />
          <text className="bp-text bp-text--dim" x={334} y={334} textAnchor="middle" fontSize={8}>{naoDetectado}</text>
        </g>
      )}

      {/* SATA — um por disco SSD/HDD */}
      {sata.map((d, n) => {
        const y = 480 + n * 28
        const idx = inv.discos.indexOf(d)
        // até 2 conectores SATA desenhados; discos extras seguem listados nas fichas
        if (n > 1) return null
        return part(`disk-${idx}`, { x: 556, y, w: 60, h: 22 }, { x: 544, y: y + 10 }, false, (
          <>
            <rect className="bp-line" x={560} y={y + 4} width={44} height={14} />
            <path className="bp-faint" d={`M564 ${y + 8} h24 v6 h-24 z`} />
            <text className="bp-text" x={560} y={y - 2} fontSize={7}>{`SATA_${n + 1}`}</text>
          </>
        ))
      })}

      {/* slot PCIe ×16 + GPU */}
      {part('gpu', { x: 126, y: 388, w: 328, h: 124 }, { x: 114, y: 378 }, false, (
        <>
          <rect className="bp-line" x={150} y={392} width={280} height={10} />
          <line className="bp-line" x1={190} y1={392} x2={190} y2={402} />
          <text className="bp-text" x={438} y={401} fontSize={7}>PCIE ×16</text>
          <rect className="bp-line" x={128} y={414} width={12} height={92} />
          <rect className="bp-line bp-fill" x={140} y={414} width={300} height={92} />
          {[225, 345].map((cx) => (
            <g key={cx}>
              <circle className="bp-line" cx={cx} cy={456} r={26} />
              <circle className="bp-faint" cx={cx} cy={456} r={9} />
              <line className="bp-faint" x1={cx - 18} y1={456 - 18} x2={cx + 18} y2={456 + 18} />
              <line className="bp-faint" x1={cx + 18} y1={456 - 18} x2={cx - 18} y2={456 + 18} />
            </g>
          ))}
          <rect className="bp-faint" x={398} y={418} width={34} height={9} />
          <text className="bp-text" x={290} y={500} textAnchor="middle" fontSize={8}>{(inv.gpu.nome ?? naoDetectado).toUpperCase()}</text>
        </>
      ))}
    </svg>
  )
}

// centro vertical dos rótulos rotacionados dos slots de RAM
const y0RAM = 150
