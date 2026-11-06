const { test } = require('node:test')
const assert = require('node:assert/strict')

test('Cordis mounts the authorization flow and provider, then releases both on disposal', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { CredentialProvider } = await import('@deepseek-ai/dsh-credentials')
  const { LlmRuntime } = await import('@deepseek-ai/dsh-llm')
  const { AuthorizationService } = await import('@deepseek-ai/dsh-authorization')
  const plugin = await import('../plugin/index.mjs')
  class MemoryCredentials extends CredentialProvider {
    async readRecord() { return undefined }
  }
  const ctx = new Context()
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
    await mounted.dispose()
    assert.deepEqual(ctx.llm.listProviders(), [])
    assert.deepEqual(ctx.authorization.list(), [])
  } finally {
    await mounted.dispose()
    await authorization.dispose()
    await llm.dispose()
    await credentials.dispose()
  }
})
