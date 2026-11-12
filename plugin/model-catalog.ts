import { type LlmResolvedModelInfo, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { Model } from '../index.cjs'

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

export type CatalogEntry = LlmResolvedModelInfo & {
  hidden?: boolean
  autoReviewModelOverride?: string
  supportsReasoningEffortUpdates?: boolean
  supportsSystemMessageUpdates?: boolean
  supportsAdditionalTools?: boolean
}

export function toHostModel({
  reasoning,
  contextWindow,
  inputModalities,
  ...model
}: Model): CatalogEntry {
  const result: CatalogEntry = {
    provider,
    ...model,
    inputModalities: inputModalities?.includes('image') ? ['text', 'image'] : ['text'],
  }
  if (model.supportsSystemMessageUpdates) result.systemPromptUpdate = 'in-history'
  if (model.supportsAdditionalTools) result.toolUpdate = 'addition-only'
  if (contextWindow !== undefined) result.context = { contextWindow }
  if (reasoning)
    result.reasoning = {
      efforts: reasoning.efforts.map((effort) => ({
        ...effort,
        id: ReasoningEffortId(effort.id),
        name: reasoningEffortNames.get(effort.id) ?? effort.name,
      })),
      ...(reasoning.defaultEffort === undefined
        ? {}
        : { defaultEffort: ReasoningEffortId(reasoning.defaultEffort) }),
    }
  return result
}
