import { addAbortListener } from 'node:events'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { LlmAdapter, projectToolUpdates } from '@deepseek-ai/dsh-llm'
import type { ChatGptClient } from '../index.cjs'
import native from '../index.cjs'
import type { SearchMode } from '../shared/features.ts'
import type { Accounts } from './accounts.ts'
import type { NativeStreamChunk } from './errors.ts'
import { providerError } from './errors.ts'
import { projectImages } from './images.ts'
import { type CatalogEntry, provider, toHostModel } from './model-catalog.ts'
import type { Operations } from './operations.ts'

export { provider } from './model-catalog.ts'

export class ChatGptAdapter extends LlmAdapter {
  client: ChatGptClient
  accounts: Accounts
  operations: Operations
  private attachments?: Pick<AttachmentStore, 'readImage'>
  private catalog: Promise<CatalogEntry[]> | undefined
  private searchMode: () => SearchMode

  constructor(
    client: ChatGptClient,
    accounts: Accounts,
    operations: Operations,
    attachments?: Pick<AttachmentStore, 'readImage'>,
    searchMode: () => SearchMode = () => 'off',
  ) {
    super()
    this.client = client
    this.accounts = accounts
    this.operations = operations
    this.attachments = attachments
    this.searchMode = searchMode
  }

  providerInfo() {
    return { id: provider, name: 'ChatGPT' }
  }

  invalidateCatalog(): void {
    this.catalog = undefined
  }

  async listModels(): Promise<LlmResolvedModelInfo[]> {
    return (await this.models()).filter((model) => !model.hidden)
  }

  private models(): Promise<CatalogEntry[]> {
    if (this.catalog) return this.catalog
    const request = this.loadModels()
    this.catalog = request
    void request.catch(() => {
      if (this.catalog === request) this.catalog = undefined
    })
    return request
  }

  async resolveModel(
    providerId: string,
    modelId: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    signal?.throwIfAborted()
    let aborted: ReturnType<typeof addAbortListener> | undefined
    try {
      const models = await (signal
        ? Promise.race([
            this.listModels(),
            new Promise<never>((_resolve, reject) => {
              aborted = addAbortListener(signal, () => reject(signal.reason))
            }),
          ])
        : this.listModels())
      signal?.throwIfAborted()
      const visible = models.find((model) => model.id === modelId)
      if (visible) return visible
      const hidden = (await this.models()).find((model) => model.hidden && model.id === modelId)
      return hidden ?? super.resolveModel(providerId, modelId, signal)
    } finally {
      aborted?.[Symbol.dispose]()
    }
  }

  private async loadModels(): Promise<CatalogEntry[]> {
    if (!(await this.hasCredentials())) return []
    const operation = this.operations.start()
    try {
      const record = await this.accounts.selected(operation.cancellation)
      return (await this.client.listModels(record, operation.cancellation)).map(toHostModel)
    } finally {
      operation.close()
    }
  }

  async hasCredentials(): Promise<boolean> {
    const vault = await this.accounts.read()
    return !!vault?.accounts.some((record) => {
      const account = native.describeSession(record)
      return account.id === vault.active && account.hasCredentials
    })
  }

  async reviewModel(parentModel?: string): Promise<LlmResolvedModelInfo> {
    const models = await this.models()
    const id =
      models.find((model) => model.id === parentModel)?.autoReviewModelOverride ??
      'codex-auto-review'
    const selected = models.find((model) => model.id === id)
    if (!selected)
      throw new Error('This ChatGPT account has no automatic review model. Check your sign-in.')
    return selected
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const webSearch = this.searchMode() !== 'off' && options.purpose === undefined
    yield* this.request(options, { webSearch })
  }

  async *search(query: string, signal?: AbortSignal): AsyncIterable<StreamChunk> {
    const model = (await this.listModels())[0]
    if (!model) throw new Error('Sign in to ChatGPT before using search.')
    yield* this.request(
      {
        provider,
        model: model.id,
        messages: [{ role: 'user', content: [{ type: 'text', text: query }] }],
        system:
          'Use web search to answer the query. Return a concise answer with source citations.',
        purpose: 'web-search',
        signal,
      },
      { webSearch: true, searchOnly: true },
    )
  }

  private async *request(
    options: GenerateOptions,
    features: { webSearch: boolean; searchOnly?: boolean },
  ): AsyncIterable<StreamChunk> {
    const operation = this.operations.start(options.signal)
    let reader: ReadableStreamDefaultReader<NativeStreamChunk> | undefined
    try {
      const record = await this.accounts.selected(operation.cancellation)
      const projected = projectToolUpdates(
        options.messages,
        options.tools,
        undefined,
        options.toolHistory,
      )
      const request = {
        ...features,
        model: options.model,
        messages: await projectImages(projected.messages, this.attachments, options.signal),
        tools: projected.tools,
        system: options.system,
        reasoningEffort: options.reasoningEffort,
      }
      reader = this.client
        .streamResponse(record, JSON.stringify(request), operation.cancellation)
        .getReader()
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
        try {
          await reader.cancel()
        } finally {
          reader.releaseLock()
        }
      }
    }
  }
}
