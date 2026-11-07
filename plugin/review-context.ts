import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-working-directory'

interface LogEvent {
  seq: number
  type: string
  data: Record<string, unknown>
}

/** Resolve the exact pending native/PTC action; previous steps cannot authorize a new call. */
export async function reviewContext(ctx: Context, request: ApprovalRequest, signal: AbortSignal) {
  const { session } = request.agent
  const events = session.snapshotEvents() as unknown as readonly LogEvent[]
  let start = -1
  for (let i = 0; i < events.length; i++) {
    if (events[i].type === 'step/start') start = i
    else if (['step/end', 'turn/start', 'turn/end'].includes(events[i].type)) start = -1
  }
  if (start < 0 || !request.callId)
    throw new Error('The review request is missing its current step or call ID.')
  const current = events.slice(start)
  const pending = current.filter(
    (event) =>
      (event.type === 'tool/call' && event.data.callId === request.callId) ||
      (event.type === 'tool/ptc-dispatch-start' && event.data.subCallId === request.callId),
  )
  if (pending.length !== 1 || pending[0].data.name !== request.toolName)
    throw new Error('The exact operation to review could not be determined.')
  if (
    current.some(
      (event) =>
        (event.type === 'tool/result' && event.data.callId === request.callId) ||
        (event.type === 'tool/ptc-dispatch' && event.data.subCallId === request.callId),
    )
  )
    throw new Error('This tool call has already completed.')
  const action = pending[0]
  const header = session.requestHeader()
  const schemas =
    action.type === 'tool/call' ? (header?.tools ?? []) : ctx.tools.schemas(request.agent)
  const matches = schemas.filter((tool) => tool.name === request.toolName)
  if (matches.length !== 1)
    throw new Error('The tool definition to review is missing or ambiguous.')
  const schema = matches[0]
  const parameters =
    action.type === 'tool/call'
      ? (JSON.parse(String(action.data.arguments || '{}')) as unknown)
      : action.data.arguments

  // Model-authored child creation prompts remain parent instructions, including inherited ones.
  const creationPrompts = new Set<number>()
  let childPrompt = false
  for (const event of events) {
    if (event.type === 'subagent/descriptor') childPrompt = true
    if (childPrompt && event.type === 'user/message') {
      const source = event.data.source as { kind?: string; rpcId?: string } | undefined
      if (source?.kind === 'user' && !source.rpcId) {
        creationPrompts.add(event.seq)
        childPrompt = false
      }
    }
  }
  const history = []
  for (const seq of session.surface.nodes) {
    const event = events[seq]
    const stored = session.eventAt(seq)
    if (!stored) throw new Error('Review context events are missing.')
    const message = session.deriveEventMessage(stored)
    if (!message) continue
    const source = message.source as { kind: string; senderSessionId?: string; rpcId?: string }
    let authority = 'fact'
    if (message.role === 'user') {
      if (source.kind === 'agent-instructions') authority = 'constraint'
      else if (source.kind === 'compact-checkpoint') authority = 'checkpoint'
      else if (
        (source.kind === 'agent-message' &&
          source.senderSessionId === session.header.parentSession) ||
        creationPrompts.has(event.seq)
      )
        authority = 'parent-instruction'
      else if (source.kind === 'user')
        authority =
          session.header.origin === 'subagent' && session.isOwnSeq(seq) && !source.rpcId
            ? 'parent-instruction'
            : 'user-instruction'
    }
    // Summaries and tool/model output never become user permission. No provider replay state is sent.
    history.push({ authority, role: message.role, source: source.kind, content: message.content })
  }
  return {
    environment: { cwd: await ctx.workingDirectory.ensure(request.agent, signal) },
    history,
    pending: {
      tool: { name: schema.name, description: schema.description, parameters: schema.parameters },
      arguments: parameters,
      approvalReason: request.reason,
    },
    parent: header?.config,
  }
}
