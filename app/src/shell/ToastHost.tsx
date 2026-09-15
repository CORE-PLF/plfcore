import { useToastsStore } from '../stores/toasts'
import { ToastCard } from '../components/Toast'
import './shell.css'

export function ToastHost() {
  const { toasts, dismiss } = useToastsStore()
  if (toasts.length === 0) return null
  return (
    <div className="toasthost">
      {toasts.map((t) => (
        <ToastCard
          key={t.id}
          kind={t.tipo}
          title={t.mensagem}
          actionLabel={t.acao?.labelKey}
          onAction={t.acao?.run}
          onDismiss={() => dismiss(t.id)}
        />
      ))}
    </div>
  )
}
