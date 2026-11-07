import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import type { WebSearchProvider, WebSearchSource } from '@deepseek-ai/dsh-web'
import { WebError } from '@deepseek-ai/dsh-web'
import type { ChatGptAdapter } from './adapter.ts'
import { searchProviderId } from './preferences.ts'

/** One public Responses search becomes a normal DSH search result for any model. */
export function chatGptSearch(adapter: ChatGptAdapter, enabled: () => boolean): WebSearchProvider {
  return {
    id: searchProviderId,
    available: enabled,
    ready: () => adapter.hasSearchCredentials(),
    async search(request, signal) {
      if (!enabled())
        throw new WebError('ChatGPT shared search is off.', 'WEB_PROVIDER_UNAVAILABLE')
      const result = new BlockAssembler()
      let replay: unknown
      let finished = false
      for await (const chunk of adapter.search(request.query, signal)) {
        result.push(chunk)
        if (chunk.type === 'finish') {
          if (chunk.reason.kind !== 'stop')
            throw new WebError('ChatGPT search did not complete.', 'WEB_PROVIDER_ERROR')
          replay = chunk.replayState
          finished = true
        }
      }
      if (!finished) throw new WebError('ChatGPT search was interrupted.', 'WEB_PROVIDER_ERROR')
      const state = replay as
        | { blocks?: { items?: OutputItem[] }[]; response?: { trailing?: OutputItem[] } }
        | undefined
      const items = [
        ...(state?.blocks?.flatMap((block) => block.items ?? []) ?? []),
        ...(state?.response?.trailing ?? []),
      ]
      const sources = new Map<string, WebSearchSource>()
      const add = (source: { url?: string; title?: string }) => {
        if (!source.url) return
        let url: URL
        try {
          url = new URL(source.url)
        } catch {
          return
        }
        if (!['https:', 'http:'].includes(url.protocol)) return
        const existing = sources.get(url.href)
        sources.set(url.href, {
          url: url.href,
          ...(existing?.title || source.title ? { title: existing?.title || source.title } : {}),
        })
      }
      let searched = false
      for (const item of items) {
        if (item.type === 'web_search_call' && item.status === 'completed') {
          searched = true
          item.action?.sources?.forEach(add)
        }
        for (const part of item.content ?? [])
          for (const annotation of part.annotations ?? []) {
            if (annotation.type === 'url_citation') add(annotation)
          }
      }
      if (!searched)
        throw new WebError(
          'ChatGPT did not perform the requested web search.',
          'WEB_PROVIDER_ERROR',
        )
      return {
        content: result
          .blocks()
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n'),
        sources: [...sources.values()],
        truncated: false,
      }
    },
  }
}

interface OutputItem {
  type: string
  status?: string
  action?: { sources?: { url: string; title?: string }[] }
  content?: { annotations?: { type: string; url?: string; title?: string }[] }[]
}
