// Cache de sessão por tela: voltar numa tela já visitada entrega o último
// resultado na hora e revalida em segundo plano — cada scan é um PowerShell.
// Falha NÃO fica em cache, e o botão de reler da tela sempre lê sem cache.
const cache = new Map<string, unknown>()

export function invalidateScan(chave?: string): void {
  if (chave === undefined) cache.clear()
  else cache.delete(chave)
}

/**
 * `aplicar` roda com o valor em cache (se houver) e de novo com a leitura nova.
 * A promise só resolve quando a leitura nova termina — quem chama sabe se ainda
 * está lendo e mostra o indicador de leitura da tela enquanto isso.
 */
export async function scanCached<T>(
  chave: string,
  ler: () => Promise<T>,
  aplicar: (valor: T) => void,
  semCache = false,
): Promise<void> {
  if (semCache) {
    cache.delete(chave)
  } else {
    const anterior = cache.get(chave) as T | undefined
    if (anterior !== undefined) aplicar(anterior)
  }
  try {
    const novo = await ler()
    cache.set(chave, novo)
    aplicar(novo)
  } catch (e) {
    cache.delete(chave)
    throw e
  }
}
