import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmError, ProviderRequestId } from '@deepseek-ai/dsh-llm'

interface ProviderFailure {
  kind: 'api' | 'auth' | 'transport' | 'timeout' | 'protocol' | 'cancelled'
  message: string
  status?: number
  code?: string
  param?: string
  requestId?: string
}

/** Private native-stream terminal event; never forwarded to the host as a stream chunk. */
export interface ProviderErrorEvent {
  type: 'provider-error'
  error: ProviderFailure
}

export type NativeStreamChunk = StreamChunk | ProviderErrorEvent

const providerCodes = new Map<string, string>([
  ['context_length_exceeded', 'CONTEXT_WINDOW_EXCEEDED'],
  ['subscription_sharing_usage_limit_exceeded', 'QUOTA'],
  ['insufficient_quota', 'QUOTA'],
  ['subscription_sharing_invalid_user', 'AUTH'],
  ['invalid_api_key', 'AUTH'],
  ['rate_limit_exceeded', 'RATE_LIMIT'],
  ['subscription_sharing_usage_unavailable', 'SERVER'],
  ['subscription_sharing_user_unavailable', 'SERVER'],
  ['server_error', 'SERVER'],
])

function failureCode(error: ProviderFailure): string {
  const known = error.code && providerCodes.get(error.code)
  if (known) return known
  if (error.kind === 'auth' || error.status === 401) return 'AUTH'
  if (error.kind === 'timeout' || error.status === 408) return 'TIMEOUT'
  if (error.kind === 'transport') return 'TRANSPORT'
  if (error.kind === 'cancelled') return 'ABORTED'
  if (error.status === 429) return 'RATE_LIMIT'
  if (error.status !== undefined && error.status >= 500) return 'SERVER'
  if (error.status === 403) return 'PERMISSION'
  return 'PROVIDER_ERROR'
}

export function providerError(event: ProviderErrorEvent): LlmError {
  const error = event.error
  return new LlmError(error.message, failureCode(error), {
    cause: error,
    status: error.status,
    requestId: error.requestId === undefined ? undefined : ProviderRequestId(error.requestId),
  })
}
