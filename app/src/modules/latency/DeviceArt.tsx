// Vista técnica explodida: clique abre o desenho em camadas e inclina em 3D.
// SVG em traço 1px cinza (amarelo só no destaque) dentro de um envelope CSS 3D — o ponteiro dá a paralaxe.
// Os números seguem no painel LEITURAS; aqui eles somem quando a peça abre.

import { useState } from 'react'
import { useT } from '../../i18n'
import { latDict } from './i18n'

export interface ArtCallout {
  label: string
  value: string | null
  tag?: { kind: 'demo' | 'estimated'; text: string } | null
}

const TRACO = 'var(--color-ink-3)'
const TRACO_FRACO = 'var(--color-ink-4)'
const FONTE = { fontFamily: 'var(--font-ui)', fontVariantNumeric: 'tabular-nums' } as const
/** Passo do leque explodido do mouse: pouco menos que a largura da camada. */
const PASSO = 96

function Callout({ c, ax, ay, tx, ty, na }: { c: ArtCallout; ax: number; ay: number; tx: number; ty: number; na: string }) {
  const val = c.value ?? na
  const valW = val.length * (c.value === null ? 6.4 : 7.6)
  return (
    <g className="da-fade">
      <polyline points={`${ax},${ay} ${tx - 24},${ty - 5} ${tx - 6},${ty - 5}`} fill="none" stroke={TRACO_FRACO} strokeWidth="1" />
      <rect x={ax - 2} y={ay - 2} width={4} height={4} fill="var(--color-signal)" />
      <text x={tx} y={ty} fontSize={9} fontWeight={600} letterSpacing="1.3" fill="var(--color-ink-3)" style={FONTE}>
        {c.label}
      </text>
      <text
        x={tx}
        y={ty + 18}
        fontSize={c.value === null ? 11 : 13}
        fontWeight={700}
        fill={c.value === null ? 'var(--color-ink-4)' : 'var(--color-ink-1)'}
        style={FONTE}
      >
        {val}
      </text>
      {c.value !== null && c.tag && (
        <g>
          <rect
            x={tx + valW + 8}
            y={ty + 7}
            width={c.tag.text.length * 5 + 9}
            height={13}
            fill="none"
            stroke={c.tag.kind === 'demo' ? 'var(--color-signal)' : 'var(--color-ink-3)'}
            strokeWidth="1"
          />
          <text
            x={tx + valW + 12.5}
            y={ty + 17}
            fontSize={8}
            letterSpacing="1"
            fill={c.tag.kind === 'demo' ? 'var(--color-signal)' : 'var(--color-ink-3)'}
            style={FONTE}
          >
            {c.tag.text}
          </text>
        </g>
      )}
    </g>
  )
}

/** Etiqueta lateral: só aparece com o desenho aberto e viaja junto com a peça. */
function Rotulo({ ax, y, texto }: { ax: number; y: number; texto: string }) {
  return (
    <g className="da-rot">
      <polyline points={`${ax},${y} ${290},${y}`} fill="none" stroke={TRACO_FRACO} strokeWidth="1" />
      <rect x={ax - 2} y={y - 2} width={4} height={4} fill="var(--color-ink-3)" />
      <text x={298} y={y + 4} fontSize={11} letterSpacing="1.3" fill="var(--color-ink-2)" style={FONTE}>
        {texto}
      </text>
    </g>
  )
}

/** Etiqueta do leque: alterna acima/abaixo pra as camadas vizinhas não colidirem. */
function RotuloEixo({ cx, acima, ate, texto }: { cx: number; acima: boolean; ate: number; texto: string }) {
  return (
    <g className="da-rot">
      <polyline
        points={acima ? `${cx},30 ${cx},${ate}` : `${cx},272 ${cx},${ate}`}
        fill="none"
        stroke={TRACO_FRACO}
        strokeWidth="1"
      />
      <rect x={cx - 2} y={ate - 2} width={4} height={4} fill="var(--color-ink-3)" />
      <text
        x={cx}
        y={acima ? 22 : 284}
        textAnchor="middle"
        fontSize={10}
        letterSpacing="1.2"
        fill="var(--color-ink-2)"
        style={FONTE}
      >
        {texto}
      </text>
    </g>
  )
}

/** `interna` some com o desenho montado: empilhadas, as camadas viram borrão. */
function Peca({
  dx = 0,
  dy = 0,
  aberto,
  interna,
  children,
}: {
  dx?: number
  dy?: number
  aberto: boolean
  interna?: boolean
  children: React.ReactNode
}) {
  return (
    <g
      className={`da-peca${interna ? ' da-interna' : ''}`}
      style={{ transform: aberto ? `translate(${dx}px, ${dy}px)` : 'none' }}
    >
      {children}
    </g>
  )
}

interface PalcoProps {
  aberto: boolean
  onToggle: () => void
  rotulo: string
  children: React.ReactNode
}

function Palco({ aberto, onToggle, rotulo, children }: PalcoProps) {
  const [par, setPar] = useState({ x: 0, y: 0 })
  return (
    <button
      type="button"
      className={`da-palco${aberto ? ' da-palco--aberto' : ''}`}
      aria-pressed={aberto}
      aria-label={rotulo}
      onClick={onToggle}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setPar({
          x: (0.5 - (e.clientY - r.top) / r.height) * 9,
          y: ((e.clientX - r.left) / r.width - 0.5) * 12,
        })
      }}
      onPointerLeave={() => setPar({ x: 0, y: 0 })}
    >
      <span className="da-paralaxe" style={{ transform: `rotateX(${par.x}deg) rotateY(${par.y}deg)` }}>
        <span className="da-orbita">{children}</span>
      </span>
      <span className="da-dica">{rotulo}</span>
    </button>
  )
}

/* ===== MOUSE ===== */

/** Vista de cima: nariz estreito, ombro cheio, traseira larga e arredondada. */
const SILHUETA =
  'M 170 44 C 182 44 190 48 194 56 C 202 72 210 92 214 116 C 219 142 222 162 222 180 C 222 202 218 222 210 238 C 200 254 186 260 170 260 C 154 260 140 254 130 238 C 122 222 118 202 118 180 C 118 162 121 142 126 116 C 130 92 138 72 146 56 C 150 48 158 44 170 44 Z'

/** A placa acompanha a silhueta: mesmo contorno, recuado pra dentro da casca. */
const RECUO = { transform: 'scale(0.85)', transformOrigin: '170px 152px', transformBox: 'view-box' } as const

interface MouseArtProps {
  latencia: ArtCallout
  polling: ArtCallout
  dpi: ArtCallout
  na: string
}

export function MouseArt({ latencia, polling, dpi, na }: MouseArtProps) {
  const t = useT(latDict)
  const [aberto, setAberto] = useState(false)
  return (
    <Palco aberto={aberto} onToggle={() => setAberto((a) => !a)} rotulo={aberto ? t('montar') : t('verPartes')}>
      <svg viewBox="0 0 460 300" width="100%" className="da-svg">
        <g
          className="da-conjunto"
          style={{ transform: aberto ? 'translate(60px, 0) scale(0.86)' : 'scale(1.1)' }}
        >
          {/* eixo de montagem — a convenção que amarra o leque num conjunto só */}
          <line
            className="da-rot"
            x1="-60"
            y1="152"
            x2="400"
            y2="152"
            stroke={TRACO_FRACO}
            strokeWidth="1"
            strokeDasharray="7 5"
          />

          {/* carcaça */}
          <Peca dx={-2 * PASSO} aberto={aberto}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d={SILHUETA} />
              <path d="M 170 46 V 152" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 158 78 H 182 V 130 H 158 Z" />
              <path d="M 122 158 C 140 168 200 168 218 158" />
              <path d="M 163 44 H 177 V 52 H 163 Z" />
              <path d="M 128 106 L 142 104 L 143 122 L 129 124 Z" />
              <path d="M 129 128 L 143 126 L 144 144 L 130 146 Z" />
              <path d="M 121 194 L 129 190 M 122 208 L 130 204 M 124 222 L 132 218" />
              <path d="M 219 194 L 211 190 M 218 208 L 210 204 M 216 222 L 208 218" />
            </g>
            {/* a roda aparece pela abertura só com o mouse montado */}
            <g className="da-fade" stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 158 88 H 182 M 158 96 H 182 M 158 104 H 182 M 158 112 H 182 M 158 120 H 182" />
            </g>
            <RotuloEixo cx={170} acima ate={46} texto={t('pecaCasca')} />
          </Peca>

          {/* roda + encoder */}
          <Peca dx={-PASSO} aberto={aberto} interna>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 158 80 H 182 V 132 H 158 Z" />
              <path d="M 150 132 H 190 V 156 H 150 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 158 88 H 182 M 158 96 H 182 M 158 104 H 182 M 158 112 H 182 M 158 120 H 182" />
              <path d="M 158 106 H 145 M 182 106 H 195" />
              <path d="M 156 156 V 166 M 170 156 V 166 M 184 156 V 166" />
            </g>
            <RotuloEixo cx={170} acima={false} ate={166} texto={t('pecaRoda')} />
          </Peca>

          {/* placa */}
          <Peca dx={0} aberto={aberto} interna>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <g style={RECUO}>
                <path d={SILHUETA} />
              </g>
              <path d="M 154 196 H 186 V 226 H 154 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 150 100 H 168 V 116 H 150 Z" />
              <path d="M 172 100 H 190 V 116 H 172 Z" />
              <path d="M 160 74 H 180 V 88 H 160 Z" />
              <path d="M 164 74 V 68 M 170 74 V 68 M 176 74 V 68" />
              <path d="M 158 116 V 152 H 150 V 196 M 182 116 V 158 H 192 V 206 H 186" />
              <path d="M 148 202 H 154 M 148 211 H 154 M 148 220 H 154 M 186 202 H 192 M 186 211 H 192 M 186 220 H 192" />
              <path d="M 170 226 V 242" />
              <circle cx="146" cy="158" r="3" />
              <circle cx="194" cy="158" r="3" />
              <circle cx="170" cy="170" r="14" />
            </g>
            <RotuloEixo cx={170} acima ate={62} texto={t('pecaPlaca')} />
          </Peca>

          {/* sensor óptico */}
          <Peca dx={PASSO} aberto={aberto} interna>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <circle cx="170" cy="170" r="18" />
              <path d="M 152 138 H 188 V 156 H 152 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <circle cx="170" cy="170" r="7" />
              <path d="M 160 138 V 130 M 170 138 V 130 M 180 138 V 130" />
              <path d="M 149 170 H 140 M 191 170 H 200 M 170 191 V 200" />
              <path d="M 144 146 H 134 V 186 H 152" />
            </g>
            <RotuloEixo cx={170} acima={false} ate={200} texto={t('pecaSensor')} />
          </Peca>

          {/* base + patins */}
          <Peca dx={2 * PASSO} aberto={aberto} interna>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d={SILHUETA} />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 140 78 L 158 71 L 163 90 L 145 96 Z" />
              <path d="M 200 78 L 182 71 L 177 90 L 195 96 Z" />
              <path d="M 132 216 L 152 209 L 157 231 L 137 236 Z" />
              <path d="M 208 216 L 188 209 L 183 231 L 203 236 Z" />
              <circle cx="170" cy="170" r="11" />
            </g>
            <RotuloEixo cx={170} acima ate={46} texto={t('pecaBase')} />
          </Peca>
        </g>

        <Callout c={latencia} ax={212} ay={82} tx={318} ty={62} na={na} />
        <Callout c={polling} ax={227} ay={152} tx={318} ty={142} na={na} />
        <Callout c={dpi} ax={214} ay={226} tx={318} ty={222} na={na} />
      </svg>
    </Palco>
  )
}

/* ===== TECLADO ===== */

/** Hélice em vista lateral: o arco da frente fica sólido, o de trás fraco. */
function helice(cx: number, topo: number, altura: number, r: number, ry: number, voltas: number) {
  const passos = 18
  const total = voltas * passos
  const frente: string[] = []
  const fundo: string[] = []
  let atual: string[] = []
  let ehFrente = false
  for (let i = 0; i <= total; i++) {
    const a = (i / passos) * Math.PI * 2
    const ponto = `${(cx + r * Math.sin(a)).toFixed(1)},${(topo + (i / total) * altura - ry * Math.cos(a)).toFixed(1)}`
    const f = Math.cos(a) < 0
    if (i === 0) ehFrente = f
    atual.push(ponto)
    if (f !== ehFrente) {
      ;(ehFrente ? frente : fundo).push(atual.join(' '))
      atual = [ponto]
      ehFrente = f
    }
  }
  if (atual.length > 1) (ehFrente ? frente : fundo).push(atual.join(' '))
  return { frente, fundo }
}

const MOLA = helice(150, 172, 44, 21, 5, 5)

const TECLAS: Array<{ x: number; y: number; w: number }> = []
for (let linha = 0; linha < 4; linha++) {
  for (let col = 0; col < 15; col++) TECLAS.push({ x: 40 + col * 15.4, y: 100 + linha * 16, w: 13 })
}
TECLAS.push({ x: 40, y: 166, w: 32 }, { x: 75, y: 166, w: 130 }, { x: 208, y: 166, w: 60 })

interface KeyboardArtProps {
  polling: ArtCallout
  latencia: ArtCallout
  atraso: ArtCallout
  na: string
}

export function KeyboardArt({ polling, latencia, atraso, na }: KeyboardArtProps) {
  const t = useT(latDict)
  const [aberto, setAberto] = useState(false)
  return (
    <Palco aberto={aberto} onToggle={() => setAberto((a) => !a)} rotulo={aberto ? t('montar') : t('verSwitch')}>
      <svg viewBox="0 0 460 300" width="100%" className="da-svg">
        {/* placa do teclado — some dando zoom na tecla marcada */}
        <g
          className="da-grupo"
          style={{
            transformOrigin: '77px 122px',
            transform: aberto ? 'scale(2.6)' : 'none',
            opacity: aberto ? 0 : 1,
          }}
        >
          <g stroke={TRACO} strokeWidth="1" fill="none">
            <path d="M 38 84 H 268 L 276 92 V 196 L 268 204 H 38 L 30 196 V 92 Z" />
          </g>
          <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
            {TECLAS.map((k, i) => (
              <rect key={i} x={k.x} y={k.y} width={k.w} height={12} />
            ))}
          </g>
          <rect x={70.8} y={116} width={13} height={12} fill="none" stroke="var(--color-signal)" strokeWidth="1.4" />
        </g>

        {/* switch explodido */}
        <g
          className="da-grupo"
          style={{
            transformOrigin: '150px 150px',
            transform: aberto ? 'translate(-16px, -8px) scale(0.88)' : 'scale(0.4)',
            opacity: aberto ? 1 : 0,
          }}
        >
          {/* keycap */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(104px)' }}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 112 58 L 119 22 L 181 22 L 188 58 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 119 28 C 135 34 165 34 181 28" />
              <path d="M 141 58 V 48 H 159 V 58" />
              <path d="M 150 48 V 58" />
            </g>
            <Rotulo ax={190} y={40} texto={t('pecaKeycap')} />
          </g>

          {/* haste (stem) */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(62px)' }}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 142 70 H 158 V 86 H 172 V 96 H 128 V 86 H 142 Z" />
              <path d="M 131 96 V 108 M 169 96 V 108" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 150 70 V 96" />
              <path d="M 172 88 L 181 96 V 106" />
            </g>
            <Rotulo ax={183} y={88} texto={t('pecaHaste')} />
          </g>

          {/* carcaça superior */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(22px)' }}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 116 162 V 130 L 128 118 H 172 L 184 130 V 162 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 140 118 V 126 H 160 V 118" />
              <path d="M 116 138 H 108 V 152 H 116 M 184 138 H 192 V 152 H 184" />
              <path d="M 126 162 V 134 M 174 162 V 134" />
            </g>
            <Rotulo ax={194} y={140} texto={t('pecaTopo')} />
          </g>

          {/* mola */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(-16px)' }}>
            <g stroke="var(--color-signal)" strokeWidth="1.4" fill="none" strokeLinecap="round">
              {MOLA.frente.map((p, i) => (
                <polyline key={i} points={p} />
              ))}
            </g>
            <g stroke="var(--color-signal)" strokeWidth="1" fill="none" opacity="0.32">
              {MOLA.fundo.map((p, i) => (
                <polyline key={i} points={p} />
              ))}
            </g>
            <Rotulo ax={174} y={194} texto={t('pecaMola')} />
          </g>

          {/* contatos */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(-52px)' }}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 130 224 V 250 L 144 258" />
              <path d="M 170 224 V 238 L 156 248" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 124 224 H 136 M 164 224 H 176" />
              <path d="M 144 258 L 156 248" strokeDasharray="3 3" />
            </g>
            <Rotulo ax={180} y={244} texto={t('pecaContato')} />
          </g>

          {/* carcaça inferior + pinos */}
          <g className="da-peca" style={{ transform: aberto ? 'none' : 'translateY(-88px)' }}>
            <g stroke={TRACO} strokeWidth="1" fill="none">
              <path d="M 118 270 H 182 V 286 L 174 294 H 126 L 118 286 Z" />
            </g>
            <g stroke={TRACO_FRACO} strokeWidth="1" fill="none">
              <path d="M 142 270 V 280 H 158 V 270" />
              <path d="M 132 294 V 300 M 168 294 V 300" />
            </g>
            <Rotulo ax={184} y={282} texto={t('pecaFundo')} />
          </g>
        </g>

        <Callout c={polling} ax={274} ay={100} tx={318} ty={62} na={na} />
        <Callout c={latencia} ax={276} ay={144} tx={318} ty={142} na={na} />
        <Callout c={atraso} ax={272} ay={190} tx={318} ty={222} na={na} />
      </svg>
    </Palco>
  )
}
