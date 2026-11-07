import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-user-approval'
import native from '../index.cjs'
import { type ChatGptAdapter, provider } from './adapter.ts'
import { reviewContext } from './review-context.ts'
import { reviewPolicy } from './review-policy.ts'

export function mountApproval(ctx: Context, adapter: ChatGptAdapter, enabled: () => boolean) {
  const active = new Set<AbortController>()
  const cancel = () => {
    for (const controller of active) controller.abort()
  }
  ctx.effect(() => cancel)
  ctx.on('settings/document-updated', () => {
    if (!enabled()) cancel()
  })
  ctx.on(
    'approval/request',
    async (request, next) => {
      if (!enabled() || ctx.permissionPresets.current(request.agent.session) === 'auto')
        return next()
      const controller = new AbortController()
      active.add(controller)
      const signal = request.signal
        ? AbortSignal.any([request.signal, controller.signal])
        : controller.signal
      try {
        signal.throwIfAborted()
        const context = await reviewContext(ctx, request, signal)
        const model = await adapter.reviewModel(
          context.parent?.provider === provider ? context.parent.model : undefined,
        )
        const effort =
          model.reasoning?.efforts.find((effort) => effort.id === 'low')?.id ??
          model.reasoning?.defaultEffort
        const result = new BlockAssembler()
        let finished = false
        for await (const chunk of ctx.llm.stream({
          provider,
          model: model.id,
          system: reviewPolicy,
          messages: [
            createUserMessage({
              source: { kind: 'user' },
              content: [{ type: 'text', text: JSON.stringify(context) }],
            }),
          ],
          purpose: 'auto-review',
          signal,
          ...(effort ? { reasoningEffort: ReasoningEffortId(effort) } : {}),
        })) {
          if (finished) throw new Error('The review stream has ended.')
          result.push(chunk)
          if (chunk.type === 'finish') {
            if (chunk.reason.kind !== 'stop') throw new Error('ChatGPT review did not complete.')
            finished = true
          }
        }
        const blocks = result.blocks()
        const text = blocks.at(-1)
        if (
          !finished ||
          text?.type !== 'text' ||
          blocks.slice(0, -1).some((block) => block.type !== 'reasoning')
        )
          throw new Error('Invalid review result format.')
        if (signal.aborted || !enabled()) return 'cancelled'
        return native.parseReviewDecision(text.text) ? 'allowed-once' : 'rejected'
      } catch {
        return signal.aborted ? 'cancelled' : 'unavailable'
      } finally {
        active.delete(controller)
      }
    },
    { prepend: true },
  )
}
