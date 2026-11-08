import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import native from '../index.cjs'
import type { Accounts } from './accounts.ts'
import type { Operations } from './operations.ts'

export async function imageGenerationAvailable(accounts: Accounts): Promise<boolean> {
  const vault = await accounts.read()
  const record = vault?.accounts.find((value) => native.describeSession(value).id === vault.active)
  if (!record) return false
  const account = native.describeSession(record)
  return account.hasCredentials && account.capabilities.imageGeneration
}

/** Presentation metadata survives replay without adding image bytes to model history. */
function attachmentFrom(meta: unknown): ImageAttachmentRef | undefined {
  if (!meta || typeof meta !== 'object') return undefined
  const value = meta as Partial<ImageAttachmentRef>
  if (
    typeof value.attachmentId !== 'string' ||
    typeof value.width !== 'number' ||
    typeof value.height !== 'number' ||
    typeof value.bytes !== 'number' ||
    !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(value.mediaType ?? '')
  )
    return undefined
  return { ...value, attachmentId: AttachmentId(value.attachmentId) } as ImageAttachmentRef
}

export function imageGenerationTool(
  accounts: Accounts,
  attachments: AttachmentStore,
  operations: Operations,
): ToolDefinition {
  return defineTool({
    name: 'chatgpt_image_generate',
    description:
      'Generate a new image when the user requests image output. Uses the currently selected ChatGPT legacy account and its subscription allowance. The generated image is displayed directly to the user. This tool does not edit existing images.',
    parameters: {
      prompt: { type: 'string', required: true, description: 'Complete description of the image.' },
      size: {
        type: 'string',
        enum: ['auto', '1024x1024', '1536x1024', '1024x1536'],
        description:
          'Preferred size. The service may return different dimensions. Use auto unless requested.',
      },
      quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
      transparent: { type: 'boolean', description: 'Use a transparent background when requested.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          attachmentId: { type: 'string', required: true },
          mediaType: {
            type: 'string',
            enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
            required: true,
          },
          bytes: { type: 'number', required: true },
          width: { type: 'number', required: true },
          height: { type: 'number', required: true },
          name: { type: 'string', required: true },
        },
      },
      render: () => [{ type: 'text', text: 'Image generated and displayed to the user.' }],
      presentationMeta: (_args, value) => value,
    },
    timeoutMs: 300_000,
    async execute(args, exec) {
      const operation = operations.start(exec.signal)
      try {
        const record = await accounts.selected(operation.cancellation)
        const limit = Math.min(
          attachments.imageLimits.maxImageBytes,
          attachments.imageLimits.maxMessageImageBytes,
        )
        const data = await accounts.client.generateImage(
          record,
          JSON.stringify(args),
          limit,
          operation.cancellation,
        )
        exec.signal.throwIfAborted()
        const ref = await attachments.saveImage({
          data,
          mediaType: 'image/png',
          name: 'chatgpt-generated.png',
        })
        return {
          attachmentId: String(ref.attachmentId),
          mediaType: ref.mediaType,
          bytes: ref.bytes,
          width: ref.width,
          height: ref.height,
          name: ref.name ?? 'chatgpt-generated.png',
        }
      } finally {
        operation.close()
      }
    },
    presentCall: () => ({ card: 'generic', title: 'Generate image', kind: 'other' }),
    presentResult: (_args, result) => {
      if (result.isError) return undefined
      const attachment = attachmentFrom(result.meta)
      if (!attachment) return undefined
      return { card: 'generic', title: 'Generated image', content: [{ type: 'image', attachment }] }
    },
  })
}
