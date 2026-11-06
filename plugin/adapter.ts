import { LlmAdapter, ReasoningEffortId, projectImagesForTextModel, projectToolUpdates } from '@deepseek-ai/dsh-llm'
import { addAbortListener } from 'node:events'
import native from '../index.cjs'
import type { ChatGptClient } from '../index.cjs'
import type { GenerateOptions, StreamChunk, LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import type { Accounts } from './accounts.ts'
import type { Operations } from './operations.ts'
import { providerError } from './errors.ts'
import type { NativeStreamChunk } from './errors.ts'

export const provider = 'openai-codex'

const reasoningEffortNames = new Map([
  ['none', '无'],
  ['minimal', '极低'],
  ['low', '轻度'],
  ['medium', '中'],
  ['high', '高'],
  ['xhigh', '极高'],
  ['max', 'Max'],
])

export class ChatGptAdapter extends LlmAdapter {
  client: ChatGptClient
  accounts: Accounts
  operations: Operations
  private catalog: Promise<LlmResolvedModelInfo[]> | undefined

  constructor(client: ChatGptClient, accounts: Accounts, operations: Operations) {
    super()
    this.client = client
    this.accounts = accounts
    this.operations = operations
  }

  providerInfo() {
    return { id: provider, name: 'ChatGPT' }
  }

  invalidateCatalog(): void {
    this.catalog = undefined
  }

  listModels(): Promise<LlmResolvedModelInfo[]> {
    if (this.catalog) return this.catalog
    const request = this.loadModels()
    this.catalog = request
    void request.catch(() => {
      if (this.catalog === request) this.catalog = undefined
    })
    return request
  }

  async resolveModel(providerId: string, modelId: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    signal?.throwIfAborted()
    let aborted: ReturnType<typeof addAbortListener> | undefined
    try {
      const models = await (signal ? Promise.race([
        this.listModels(),
        new Promise<never>((_resolve, reject) => {
          aborted = addAbortListener(signal, () => reject(signal.reason))
        }),
      ]) : this.listModels())
      signal?.throwIfAborted()
      return models.find(model => model.id === modelId) ?? super.resolveModel(providerId, modelId, signal)
    } finally { aborted?.[Symbol.dispose]() }
  }

  private async loadModels(): Promise<LlmResolvedModelInfo[]> {
    const vault = await this.accounts.read()
    if (!vault?.accounts.some(record => {
      const account = native.describeSession(record)
      return account.clientId === vault.active && account.hasCredentials
    })) return []
    const operation = this.operations.start()
    try {
      const record = await this.accounts.selected(operation.cancellation)
      return (await this.client.listModels(record, operation.cancellation))
        .map(({ reasoning, contextWindow, ...model }) => ({
          provider, ...model, inputModalities: ['text'] as const,
          ...(contextWindow === undefined ? {} : { context: { contextWindow } }),
          ...(reasoning ? { reasoning: {
            efforts: reasoning.efforts.map(effort => ({
              ...effort,
              id: ReasoningEffortId(effort.id),
              name: reasoningEffortNames.get(effort.id) ?? effort.name,
            })),
            ...(reasoning.defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) }),
          } } : {}),
        }))
    } finally { operation.close() }
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const operation = this.operations.start(options.signal)
    let reader: ReadableStreamDefaultReader<NativeStreamChunk> | undefined
    try {
      const record = await this.accounts.selected(operation.cancellation)
      const projected = projectToolUpdates(options.messages, options.tools, undefined, options.toolHistory)
      const request = {
        model: options.model,
        messages: projectImagesForTextModel(projected.messages),
        tools: projected.tools,
        system: options.system,
        reasoningEffort: options.reasoningEffort,
      }
      reader = this.client.streamResponse(record, JSON.stringify(request), operation.cancellation).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (value.type === 'provider-error') throw providerError(value)
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
