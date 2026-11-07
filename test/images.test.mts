import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { LlmRuntime, type RequestMessage } from '@deepseek-ai/dsh-llm'
import native from '../index.cjs'
import type { Accounts } from '../plugin/accounts.ts'
import { ChatGptAdapter } from '../plugin/adapter.ts'
import { projectImages } from '../plugin/images.ts'
import { Operations } from '../plugin/operations.ts'
import { type ImageDetail, imageDetails } from '../shared/features.ts'
import { sessionRecord } from './session-fixture.mts'

test('DSH preserves images for vision models and projects text-only and offloaded images without reads', async () => {
  const ref = {
    attachmentId: AttachmentId('sha256:fixture'),
    mediaType: 'image/png' as const,
    bytes: 3,
    width: 1,
    height: 1,
  }
  const messages: RequestMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Compare these' },
        { type: 'image', attachment: ref },
        { type: 'image', attachment: ref },
        { type: 'image', attachment: ref, offloaded: true },
      ],
    },
  ]
  const before = JSON.stringify(messages)
  const ctx = new Context()
  const llm = ctx.plugin(LlmRuntime)
  await llm.await()
  const record = sessionRecord()
  const accounts = {
    selected: async () => record,
    read: async () => ({ active: native.describeSession(record).id, accounts: [record] }),
  } as unknown as Accounts
  const client = new native.ChatGptClient({})
  client.listModels = async () => [
    { id: 'vision', name: 'Vision', inputModalities: ['text', 'image'] },
    { id: 'text', name: 'Text' },
  ]
  let reads = 0
  const attachments = {
    readImage: async () => {
      reads++
      return { ref, data: new Uint8Array([1, 2, 3]) }
    },
  }
  let request: {
    messages: { content: { type: string; imageUrl?: string }[] }[]
    imageDetail?: ImageDetail
  } = { messages: [] }
  client.streamResponse = (_record, json) => {
    request = JSON.parse(json)
    return new ReadableStream({
      start(c) {
        c.enqueue({ type: 'finish', reason: { kind: 'stop' } })
        c.close()
      },
    })
  }
  const operations = new Operations()
  let imageDetail: ImageDetail = 'auto'
  const adapter = new ChatGptAdapter(
    client,
    accounts,
    operations,
    attachments,
    undefined,
    () => imageDetail,
  )
  const unregister = ctx.llm.registerAdapter(['openai-codex'], adapter)
  try {
    for await (const chunk of ctx.llm.stream({
      provider: 'openai-codex',
      model: 'vision',
      messages,
    })) {
      assert.ok(chunk.type === 'finish' && chunk.reason.kind === 'stop')
    }
    assert.equal(reads, 2)
    assert.equal(request.messages[0].content[1].imageUrl, 'data:image/png;base64,AQID')
    assert.equal(request.messages[0].content[2].imageUrl, 'data:image/png;base64,AQID')
    assert.equal(request.messages[0].content[3].type, 'text')
    assert.equal(request.imageDetail, 'auto')
    for await (const _ of ctx.llm.stream({ provider: 'openai-codex', model: 'text', messages })) {
      /* consume */
    }
    assert.equal(reads, 2)
    assert.ok(request.messages[0].content.every((block) => block.type === 'text'))
    assert.equal(JSON.stringify(messages), before)
    const abort = new AbortController()
    abort.abort(new Error('cancel image read'))
    await assert.rejects(projectImages(messages, attachments, abort.signal), /cancel image read/)
    assert.equal(reads, 2)
    await assert.rejects(
      projectImages(messages, {
        readImage: async () => {
          throw new Error('missing attachment')
        },
      }),
      /missing attachment/,
    )
    for (const detail of imageDetails) {
      imageDetail = detail
      for await (const _ of ctx.llm.stream({
        provider: 'openai-codex',
        model: 'vision',
        messages,
      })) {
        /* consume */
      }
      assert.equal(request.imageDetail, detail)
      assert.equal(JSON.stringify(messages), before)
    }
  } finally {
    unregister()
    operations.dispose()
    await llm.dispose()
  }
})
