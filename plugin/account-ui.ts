import type { Context } from '@deepseek-ai/cordis'
import type { AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import { clientRequestSchema } from '@deepseek-ai/dsh-client-connection'
import type { LoginState } from '../shared/account-ui.ts'
import type { Accounts } from './accounts.ts'
import { accountsKey } from './accounts.ts'
import type { Operations } from './operations.ts'

function selectedId(payload: unknown): string {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('id' in payload) ||
    typeof payload.id !== 'string'
  ) {
    throw new Error('Choose a ChatGPT account.')
  }
  return payload.id
}

/** Safe UI projection of the host-owned authorization flow. No credential or URL crosses this face. */
export function mountAccountUi(
  ctx: Context,
  accounts: Accounts,
  operations: Operations,
  savePreference?: (payload: unknown) => Promise<void>,
): void {
  let login: LoginState = { running: false }
  let pendingPrompt: ((id: string) => void) | undefined
  let controller: AbortController | undefined

  function prompt(request: AuthorizationPrompt, signal: AbortSignal): Promise<string> {
    if (request.kind !== 'select') throw new Error('Unsupported ChatGPT authorization prompt')
    return new Promise<string>((resolve, reject) => {
      const abort = () => {
        pendingPrompt = undefined
        delete login.prompt
        reject(new AuthorizationDeclinedError())
      }
      if (signal.aborted) {
        abort()
        return
      }
      signal.addEventListener('abort', abort, { once: true })
      login.prompt = { message: request.message, options: request.options }
      pendingPrompt = (id) => {
        signal.removeEventListener('abort', abort)
        pendingPrompt = undefined
        delete login.prompt
        resolve(id)
      }
    })
  }

  async function dispatch(action: string, payload: unknown, signal: AbortSignal): Promise<unknown> {
    switch (action) {
      case 'status':
        return { ...(await accounts.summary()), login }
      case 'quota': {
        const operation = operations.start(signal)
        try {
          const record = await accounts.selected(operation.cancellation, selectedId(payload))
          return await accounts.client.readQuota(record, operation.cancellation)
        } finally {
          operation.close()
        }
      }
      case 'preference': {
        if (!savePreference) throw new Error('Host settings cannot be edited right now.')
        await savePreference(payload)
        return null
      }
      case 'login': {
        if (login.running) throw new Error('ChatGPT sign-in is already in progress.')
        const attemptController = new AbortController()
        controller = attemptController
        const state: LoginState = {
          running: true,
          notice: 'Preparing ChatGPT sign-in…',
        }
        login = state
        void ctx.authorization
          .begin({
            key: accountsKey,
            signal: attemptController.signal,
            interaction: {
              notify: (notice) => {
                state.notice = notice.message
                state.device =
                  notice.code && notice.url === 'https://auth.openai.com/codex/device'
                    ? { url: notice.url, code: notice.code }
                    : undefined
              },
              prompt: (request) => prompt(request, attemptController.signal),
            },
          })
          .then((outcome) => {
            if (outcome.status !== 'authorized') state.notice = 'Sign-in cancelled.'
          })
          .catch((error: unknown) => {
            state.error =
              error instanceof Error && 'code' in error && error.code === 'GenericFailure'
                ? error.message
                : 'ChatGPT sign-in did not complete. Please try again.'
          })
          .finally(() => {
            state.running = false
            delete state.prompt
            delete state.device
            pendingPrompt = undefined
          })
        return null
      }
      case 'answer': {
        const id = selectedId(payload)
        if (!pendingPrompt || !login.prompt?.options.some((option) => option.id === id)) {
          throw new Error('This sign-in option is no longer available.')
        }
        pendingPrompt(id)
        return null
      }
      case 'cancel':
        controller?.abort()
        return null
      case 'select':
      case 'logout': {
        if (login.running) throw new Error('Complete or cancel sign-in first.')
        const id = selectedId(payload)
        operations.dispose()
        let outcome: { revocationConfirmed?: boolean; localOnly?: boolean } = {}
        if (action === 'select') await accounts.select(id)
        else {
          const operation = operations.start(signal)
          try {
            outcome = await accounts.logout(id, operation.cancellation)
          } finally {
            operation.close()
          }
        }
        return outcome
      }
      default:
        throw new Error('Unknown ChatGPT operation.')
    }
  }

  ctx.effect(() => () => controller?.abort())
  for (const action of [
    'status',
    'quota',
    'login',
    'answer',
    'cancel',
    'select',
    'logout',
    'preference',
  ]) {
    const method = `codex-provider/${action}`
    ctx.effect(() =>
      ctx.connection.fetch.register({
        path: `/api/${method}`,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          if (
            request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json'
          ) {
            return new Response('Expected JSON', { status: 415 })
          }
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return new Response('Invalid JSON', { status: 400 })
          }
          const parsed = clientRequestSchema.safeParse(body)
          if (!parsed.success || parsed.data.method !== method)
            return new Response('Invalid RPC envelope', { status: 400 })
          let result:
            | { ok: true; value: unknown }
            | {
                ok: false
                error: { code: string; message: string; details: Record<string, never> }
              }
          try {
            request.signal.throwIfAborted()
            result = {
              ok: true,
              value: await dispatch(action, parsed.data.payload, request.signal),
            }
          } catch (cause) {
            const fileError =
              action === 'preference' &&
              cause &&
              typeof cause === 'object' &&
              'syscall' in cause &&
              cause.syscall === 'rename' &&
              'code' in cause &&
              ['EACCES', 'EBUSY', 'EPERM'].includes(String(cause.code))
            result = {
              ok: false,
              error: {
                code: fileError ? 'settings-file-unavailable' : 'chatgpt-operation-failed',
                message: fileError
                  ? 'Cannot save the configuration file. Close it in your editor and try again. If the problem continues, check write permissions.'
                  : action === 'preference'
                    ? 'Could not save settings. Try again later.'
                    : 'The ChatGPT operation failed. Check your sign-in and try again.',
                details: {},
              },
            }
          }
          return Response.json({ type: 'server-response', rpcId: parsed.data.rpcId, result })
        },
      }),
    )
  }
}
