import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Context as CordisContext } from '@deepseek-ai/cordis'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'

test('Cordis mounts the authorization flow and provider, then releases both on disposal', async () => {
  const { Context, Service } = await import('@deepseek-ai/cordis')
  const { LlmRuntime } = await import('@deepseek-ai/dsh-llm')
  const { AuthorizationService } = await import('@deepseek-ai/dsh-authorization')
  const plugin = await import('../plugin/index.ts')
  class MemoryCredentials extends Service {
    constructor(ctx: CordisContext) {
      super(ctx, 'credentials')
    }
    async readRecord() {
      return undefined
    }
  }
  const ctx = new Context()
  ctx.provide('attachments', {} as never)
  const routes = new Set<string>()
  ctx.provide('connection', {
    fetch: {
      register(route) {
        routes.add(route.path)
        return () => {
          routes.delete(route.path)
        }
      },
    },
  } as HostConnectionHandle)
  const credentials = ctx.plugin(MemoryCredentials)
  const llm = ctx.plugin(LlmRuntime)
  const authorization = ctx.plugin(AuthorizationService)
  await Promise.all([credentials.await(), llm.await(), authorization.await()])
  const mounted = ctx.plugin(plugin)
  try {
    await mounted.await()
    assert.deepEqual(ctx.llm.listProviders(), [{ id: 'openai-codex', name: 'ChatGPT' }])
    assert.equal(ctx.authorization.list()[0].key, 'codex-provider/accounts')
    assert.deepEqual(await ctx.llm.listModels('openai-codex'), [])
    assert.equal(routes.size, 7)
    await mounted.dispose()
    assert.deepEqual(ctx.llm.listProviders(), [])
    assert.deepEqual(ctx.authorization.list(), [])
    assert.equal(routes.size, 0)
  } finally {
    await mounted.dispose()
    await authorization.dispose()
    await llm.dispose()
    await credentials.dispose()
  }
})
