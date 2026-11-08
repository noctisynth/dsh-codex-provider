import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { imageGenerationAvailable, imageGenerationTool } from '../plugin/image-generation.ts'
import { Operations } from '../plugin/operations.ts'
import { sessionRecord } from './session-fixture.mts'

test('image tools follow the active route and retain attachment presentation without image tokens', async () => {
  const siwc = sessionRecord()
  const legacy = JSON.stringify({
    ...JSON.parse(siwc),
    login_method: 'codex-device',
    client_id: 'app_EMoamEEZ73f0CkXaXp7hrann',
    account_id: 'synthetic-workspace',
  })
  let current = siwc
  const client = new native.ChatGptClient({})
  const accounts = {
    read: async () => ({ active: native.describeSession(current).id, accounts: [siwc, legacy] }),
    selected: async () => current,
    client,
  } as unknown as Accounts
  const operations = new Operations()
  let saves = 0
  const ref = {
    attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
    mediaType: 'image/png' as const,
    width: 1024,
    height: 1024,
    bytes: 8,
  }
  const attachments = {
    imageLimits: { maxImageBytes: 1024, maxMessageImageBytes: 2048 },
    async saveImage({ data }: { data: Uint8Array }) {
      saves++
      assert.deepEqual(Buffer.from(data), Buffer.from('fixture'))
      return ref
    },
  } as unknown as AttachmentStore
  const tool = imageGenerationTool(accounts, attachments, operations)
  assert.equal(await imageGenerationAvailable(accounts), false)
  const signal = new AbortController().signal
  const exec = { signal } as ToolRunContext
  await assert.rejects(tool.execute({ prompt: 'A circle' }, exec), /not available/)
  assert.equal(saves, 0)
  current = legacy
  assert.equal(await imageGenerationAvailable(accounts), true)
  const generate = client.generateImage.bind(client)
  client.generateImage = async (record, json, maximum) => {
    assert.equal(record, legacy)
    assert.equal(JSON.parse(json).prompt, 'A circle')
    assert.equal(maximum, 1024)
    return Buffer.from('fixture')
  }
  const value = (await tool.execute({ prompt: 'A circle' }, exec)) as never
  const content = tool.output.render({}, value)
  assert.ok(content.every((block) => block.type === 'text'))
  const meta = tool.output.presentationMeta?.({}, value)
  const shown = tool.presentResult?.({ prompt: 'A circle' }, { isError: false, content, meta })
  assert.ok(shown?.card === 'generic')
  assert.deepEqual(shown.content, [
    { type: 'image', attachment: { ...ref, name: 'chatgpt-generated.png' } },
  ])
  assert.deepEqual(tool.presentResult?.({}, { isError: true, content: [], meta }), undefined)
  assert.doesNotMatch(JSON.stringify(meta), /base64|access_token|refresh_token/)
  client.generateImage = generate
  const stopped = new AbortController()
  stopped.abort()
  await assert.rejects(
    tool.execute({ prompt: 'Cancelled image' }, { signal: stopped.signal } as ToolRunContext),
    /cancelled/i,
  )
  assert.equal(saves, 1)
  operations.dispose()
})

test('native quota and generation refuse SIWC and cancelled requests before network access', async () => {
  const client = new native.ChatGptClient({})
  const cancellation = new native.Cancellation()
  const record = sessionRecord()
  await assert.rejects(client.readQuota(record, cancellation), /not available/)
  await assert.rejects(client.generateImage(record, '{}', 1024, cancellation), /not available/)
  cancellation.cancel()
  await assert.rejects(client.readQuota(record, cancellation), /cancelled/i)
})
