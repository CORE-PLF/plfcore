import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { requireStaff } from '@/lib/auth'
import { Chamfer, Kicker } from '@/components/ui'
import { TotpSetup } from '../(painel)/config/totp-setup'
import { TOTP_COOKIE, totpCookieValid } from '../totp-cookie'
import { TotpGateForm } from './totp-form'

export const metadata = { title: 'Verificação em duas etapas' }

// 2FA é obrigatória para todo staff: sem segredo cadastrado, esta página vira
// o cadastro; com segredo, é o portão de verificação de cada acesso.
export default async function TwoFactorGatePage() {
  const user = await requireStaff('SUPPORT')

  if (!user.totpSecret) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Chamfer cut={8} className="w-full max-w-lg p-6">
          <Kicker>2FA OBRIGATÓRIA</Kicker>
          <h1 className="type-display mt-2 text-2xl">CADASTRE A VERIFICAÇÃO EM DUAS ETAPAS</h1>
          <p className="mt-2 text-sm text-ink-3">
            O painel administrativo só abre com 2FA ativa. Cadastre o segredo no aplicativo
            autenticador, confirme com um código e guarde os códigos de recuperação.
          </p>
          <div className="mt-4">
            <TotpSetup enabled={false} />
          </div>
        </Chamfer>
      </div>
    )
  }

  const jar = await cookies()
  if (totpCookieValid(user.id, jar.get(TOTP_COOKIE)?.value)) redirect('/admin')

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Chamfer cut={8} className="w-full max-w-sm p-6">
        <Kicker>VERIFICAÇÃO EM DUAS ETAPAS</Kicker>
        <h1 className="type-display mt-2 text-2xl">CONFIRME SUA IDENTIDADE</h1>
        <p className="mt-2 text-sm text-ink-3">
          Digite o código de 6 dígitos do aplicativo autenticador — ou um código de recuperação,
          se perdeu o acesso ao autenticador.
        </p>
        <TotpGateForm />
      </Chamfer>
    </div>
  )
}
