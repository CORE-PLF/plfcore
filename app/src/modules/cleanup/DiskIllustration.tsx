import { Surface } from '../../components/Surface'
import { ScanLine } from '../../components/ScanLine'

// Ilustração técnica original: SSD M.2 em traço 1px sobre carbon.
// Micro-textos são silkscreen decorativo da placa (aria-hidden), não copy de UI.
export function DiskIllustration({ scanning }: { scanning: boolean }) {
  return (
    <Surface cut={8} flat className="relative min-h-[460px] overflow-hidden">
      <div className="stage-grid absolute inset-px" aria-hidden />
      <svg
        viewBox="0 0 360 560"
        className="relative mx-auto block h-full max-h-[560px] w-full"
        aria-hidden="true"
        role="presentation"
      >
        <g stroke="var(--color-signal)" strokeWidth="1" fill="none">
          {/* marcas de registro nos cantos */}
          <path d="M10 22V10h12M338 10h12v12M350 538v12h-12M22 550H10v-12" strokeOpacity="0.4" />

          {/* contorno da placa */}
          <polygon points="132,76 228,76 236,84 236,462 228,470 132,470 124,462 124,84" strokeOpacity="0.9" />

          {/* furo de parafuso */}
          <circle cx="180" cy="94" r="5.5" strokeOpacity="0.8" />
          <path d="M174 94h12M180 88v12" strokeOpacity="0.5" />

          {/* controlador */}
          <rect x="148" y="150" width="64" height="64" fill="rgba(255,46,63,0.06)" strokeOpacity="0.9" />
          <path d="M140 158h8M140 166h8M140 174h8M140 182h8M140 190h8M140 198h8M140 206h8" strokeOpacity="0.45" />
          <path d="M212 158h8M212 166h8M212 174h8M212 182h8M212 190h8M212 198h8M212 206h8" strokeOpacity="0.45" />
          <path d="M156 142v8M164 142v8M172 142v8M180 142v8M188 142v8M196 142v8M204 142v8" strokeOpacity="0.45" />
          <path d="M156 214v8M164 214v8M172 214v8M180 214v8M188 214v8M196 214v8M204 214v8" strokeOpacity="0.45" />

          {/* DRAM e NAND */}
          <rect x="148" y="246" width="64" height="32" strokeOpacity="0.7" />
          <rect x="148" y="298" width="64" height="54" strokeOpacity="0.7" />
          <rect x="148" y="368" width="64" height="54" strokeOpacity="0.7" />

          {/* trilhas */}
          <path d="M164 222v24M180 222v24M196 222v24" strokeOpacity="0.3" />
          <path d="M164 278v20M180 278v20M196 278v20" strokeOpacity="0.3" />
          <path d="M164 352v16M180 352v16M196 352v16" strokeOpacity="0.3" />
          <path d="M164 422v48M180 422v48M196 422v48" strokeOpacity="0.3" />
          <path d="M132 100v340l8 8v22M228 100v340l-8 8v22" strokeOpacity="0.22" />

          {/* conector: dedos + entalhe da chave M */}
          <path
            d="M132 470v22M140 470v22M148 470v22M156 470v22M164 470v22M172 470v22M180 470v22M188 470v22M208 470v22M216 470v22M224 470v22"
            strokeOpacity="0.7"
          />
          <path d="M192 470v12h12v-12" strokeOpacity="0.8" />

          {/* cotas de dimensão */}
          <path d="M256 76h12M256 470h12M262 76v394" strokeOpacity="0.3" />
          <path d="M124 506v12M236 506v12M124 512h112" strokeOpacity="0.3" />
        </g>

        <g className="type-mono" fill="var(--color-ink-3)" fontSize="7" letterSpacing="0.14em">
          <text x="16" y="34">NVMe M.2 2280</text>
          <text x="16" y="46">PCIe 4.0 ×4</text>
          <text x="16" y="58">REV 2.1</text>
          <text x="180" y="265" textAnchor="middle">DRAM</text>
          <text x="180" y="328" textAnchor="middle">NAND 0</text>
          <text x="180" y="398" textAnchor="middle">NAND 1</text>
          <text x="180" y="530" textAnchor="middle" fill="var(--color-ink-4)">22.0 MM</text>
          <text x="272" y="273" textAnchor="middle" transform="rotate(90 272 273)" fill="var(--color-ink-4)">
            80.0 MM
          </text>
          <text x="104" y="273" textAnchor="middle" transform="rotate(-90 104 273)">
            RESYNC CORE // STORAGE LINK // ACTIVE
          </text>
          <text x="28" y="543">STORAGE LINK // ACTIVE</text>
        </g>

        <g className="type-mono" fill="var(--color-signal)" fontSize="10" letterSpacing="0.2em" textAnchor="middle">
          <text x="180" y="178">RESYNC</text>
          <text x="180" y="192">CORE</text>
        </g>
        <rect x="16" y="536" width="6" height="6" fill="var(--color-signal)" />
      </svg>
      <ScanLine active={scanning} durationS={2.8} />
    </Surface>
  )
}
