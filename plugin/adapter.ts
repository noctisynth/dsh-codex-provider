import { LlmAdapter, projectImagesForTextModel, projectToolUpdates } from '@deepseek-ai/dsh-llm'
import native from '../index.cjs'
import type { ChatGptClient } from '../index.cjs'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Accounts } from './accounts.ts'
import type { Operations } from './operations.ts'

export const provider = 'openai-codex'

export class ChatGptAdapter extends LlmAdapter {
  client: ChatGptClient
  accounts: Accounts
  operations: Operations

  constructor(client: ChatGptClient, accounts: Accounts, operations: Operations) {
    super()
    this.client = client
    this.accounts = accounts
    this.operations = operations
  }

  providerInfo() {
    return { id: provider, name: 'ChatGPT' }
  }

  async listModels() {
    const vault = await this.accounts.read()
    if (!vault?.accounts.some(record => {
      const account = native.describeSession(record)
      return account.clientId === vault.active && account.hasCredentials
    })) return []
    const operation = this.operations.start()
    try {
      const record = await this.accounts.selected(operation.cancellation)
      return (await this.client.listModels(record, operation.cancellation))
        .map(model => ({ provider, ...model, inputModalities: ['text'] as const }))
    } finally { operation.close() }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const operation = this.operations.start(options.signal)
    let reader: ReadableStreamDefaultReader<StreamChunk> | undefined
    try {
      const record = await this.accounts.selected(operation.cancellation)
      const projected = projectToolUpdates(options.messages, options.tools, undefined, options.toolHistory)
      const request = {
        model: options.model,
        messages: projectImagesForTextModel(projected.messages),
        tools: projected.tools,
        system: options.system,
        reasoningEffort: options.reasoningEffort,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      }
      reader = this.client.streamResponse(record, JSON.stringify(request), operation.cancellation).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        yield value
      }
    } finally {
      // Wake a native pending read before awaiting ReadableStream cancellation.
      operation.close()
      if (reader) {
        try { await reader.cancel() } finally { reader.releaseLock() }
      }
    }
  }
}
