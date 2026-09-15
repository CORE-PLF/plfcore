import { env } from '../env'
import { mercadopagoProvider } from './mercadopago'
import { sandboxProvider } from './sandbox'
import type { PaymentProvider } from './types'

export function getPaymentProvider(name = env.PAYMENT_PROVIDER): PaymentProvider {
  return name === 'mercadopago' ? mercadopagoProvider : sandboxProvider
}

export function getProviderByName(name: string): PaymentProvider | null {
  if (name === 'mercadopago') return mercadopagoProvider
  if (name === 'sandbox') return sandboxProvider
  return null
}

export type { CheckoutStart, PaymentProvider, WebhookEvent } from './types'
