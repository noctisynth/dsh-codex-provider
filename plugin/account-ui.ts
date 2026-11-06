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
    throw new Error('请选择 ChatGPT 注册。')
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
      case 'preference': {
        if (!savePreference) throw new Error('宿主设置暂不可编辑。')
        await savePreference(payload)
        return null
      }
      case 'login': {
        if (login.running) throw new Error('ChatGPT 登录正在进行。')
        const attemptController = new AbortController()
        controller = attemptController
        const state: LoginState = {
          running: true,
          notice: '正在准备 ChatGPT 官方登录…',
        }
        login = state
        void ctx.authorization
          .begin({
            key: accountsKey,
            signal: attemptController.signal,
            interaction: {
              notify: (notice) => {
                state.notice = notice.message
              },
              prompt: (request) => prompt(request, attemptController.signal),
            },
          })
          .then((outcome) => {
            if (outcome.status !== 'authorized') state.notice = '已取消登录。'
          })
          .catch(() => {
            state.error = 'ChatGPT 登录未完成，请重试。'
          })
          .finally(() => {
            state.running = false
            delete state.prompt
            pendingPrompt = undefined
          })
        return null
      }
      case 'answer': {
        const id = selectedId(payload)
        if (!pendingPrompt || !login.prompt?.options.some((option) => option.id === id)) {
          throw new Error('该登录选项已不可用。')
        }
        pendingPrompt(id)
        return null
      }
      case 'cancel':
        controller?.abort()
        return null
      case 'select':
      case 'logout': {
        if (login.running) throw new Error('请先完成或取消登录。')
        const id = selectedId(payload)
        operations.dispose()
        let confirmed: boolean | undefined
        if (action === 'select') await accounts.select(id)
        else {
          const operation = operations.start(signal)
          try {
            confirmed = await accounts.logout(id, operation.cancellation)
          } finally {
            operation.close()
          }
        }
        return { revocationConfirmed: confirmed }
      }
      default:
        throw new Error('未知 ChatGPT 操作。')
    }
  }

  ctx.effect(() => () => controller?.abort())
  for (const action of ['status', 'login', 'answer', 'cancel', 'select', 'logout', 'preference']) {
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
                  ? '无法保存配置文件：请关闭编辑器中打开的 DSH 配置文件后重试；若仍失败，请检查写入权限。'
                  : action === 'preference'
                    ? '设置保存失败，请稍后重试。'
                    : 'ChatGPT 操作失败，请检查登录状态后重试。',
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
