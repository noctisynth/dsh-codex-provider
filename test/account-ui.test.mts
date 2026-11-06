import { test } from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { Context, Service } from '@deepseek-ai/cordis'
import type { CredentialRecord, CredentialKey } from '@deepseek-ai/dsh-credentials'
import { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { serverResponseSchema } from '@deepseek-ai/dsh-client-connection'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { AccountStatus } from '../shared/account-ui.ts'
import { Accounts, accountsKey } from '../plugin/accounts.ts'
import { mountAccountUi } from '../plugin/account-ui.ts'
import { Operations } from '../plugin/operations.ts'
import { ChatGptClient, createHostId } from '../index.cjs'
import { sessionRecord } from './session-fixture.mts'

test('the host UI keeps credentials private and cancels a pending authorization selection', async () => {
  const ctx = new Context()
  const opaque = sessionRecord()
  let record: CredentialRecord = { kind: 'grant', payload: { hostId: createHostId(), accounts: [opaque] } }
  class Credentials extends Service {
    constructor(ctx: Context) { super(ctx, 'credentials') }
    async readRecord() { return record }
    async describeRecord() { return { configured: true, kind: 'grant', writable: true } }
    async modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord) => Promise<CredentialRecord | undefined>) {
      record = await mutate(record) ?? record
      ctx.emit('credentials/record-updated', key)
      return record
    }
  }
  const routes = new Map<string, (request: Request) => Response | Promise<Response>>()
  ctx.provide('connection', { fetch: { register(route) {
    routes.set(route.path, route.fetch)
    return () => { routes.delete(route.path) }
  } } } as HostConnectionHandle)
  const credentials = ctx.plugin(Credentials)
  const authorization = ctx.plugin(AuthorizationService)
  await Promise.all([credentials.await(), authorization.await()])
  const flow = ctx.authorization.registerFlow({
    key: accountsKey, label: 'ChatGPT', methods: [{ id: 'oauth', label: 'Login' }],
    async run(session) {
      await session.prompt({ kind: 'select', message: 'Choose account', options: [{ id: 'add', label: 'Add account' }] })
      throw new Error('Cancelled selection must never continue')
    },
  })
  const operations = new Operations()
  const mounted = ctx.plugin({
    inject: ['credentials', 'authorization', 'connection'],
    apply(child: Context) {
      mountAccountUi(child, new Accounts(child.credentials, new ChatGptClient({}), operations), operations)
    },
  })
  await mounted.await()
  async function rpc(action: string, payload: unknown = null) {
    const handler = routes.get(`/api/codex-provider/${action}`)
    assert.ok(handler)
    const response = await handler(new Request(`http://localhost/api/codex-provider/${action}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'test', method: `codex-provider/${action}`, payload }),
    }))
    return serverResponseSchema.parse(await response.json()).result
  }
  try {
    const result = await rpc('status')
    assert.equal(result.ok, true)
    assert.equal(JSON.stringify(result).includes('access_token'), false)
    assert.equal(JSON.stringify(result).includes('refresh_token'), false)
    assert.equal(JSON.stringify(result).includes(opaque), false)
    assert.equal((await rpc('login')).ok, true)
    await setImmediate()
    const waiting = await rpc('status')
    assert.ok(waiting.ok)
    assert.equal((waiting.value as AccountStatus).login.prompt?.options[0].id, 'add')
    const invalid = await rpc('answer', { id: 'not-offered' })
    assert.equal(invalid.ok, false)
    assert.equal((await rpc('cancel')).ok, true)
    await setImmediate()
    const cancelled = await rpc('status')
    assert.ok(cancelled.ok)
    assert.equal((cancelled.value as AccountStatus).login.running, false)
    await mounted.dispose()
    assert.equal(routes.size, 0)
  } finally {
    await mounted.dispose()
    flow()
    await authorization.dispose()
    await credentials.dispose()
    operations.dispose()
  }
})
