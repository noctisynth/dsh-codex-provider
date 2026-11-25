import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PreferenceKey } from '../shared/features.ts'

export class PreferenceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export async function setPreference(
  rpc: ClientConnectionRpc,
  key: PreferenceKey,
  value: string | boolean,
): Promise<void> {
  const result = await rpc.call('/api', 'codex-provider/preference', { key, value })
  if (!result.ok) throw new PreferenceError(result.error.code, result.error.message)
}
