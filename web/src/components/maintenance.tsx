import { Chamfer, Kicker } from '@/components/ui'

// Tela cheia exibida quando maintenance_mode está ligado (staff não vê).
// /api/** e /admin ficam fora dos layouts que a renderizam — nunca bloqueados.
export function Maintenance({ supportUrl }: { supportUrl?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <Chamfer cut={12} brackets edge="var(--color-heat)" className="w-full max-w-xl p-8 text-center">
        <Kicker>OPERAÇÃO</Kicker>
        <h1 className="type-display mt-1 text-4xl text-ink-1">EM MANUTENÇÃO</h1>
        <p className="mt-4 text-sm text-ink-2">
          Voltamos em instantes. Licenças ativas continuam funcionando normalmente.
        </p>
        {supportUrl && (
          <a href={supportUrl} className="btn btn--ghost btn--sm chamfer mt-6">
            VER STATUS
          </a>
        )}
      </Chamfer>
    </main>
  )
}
