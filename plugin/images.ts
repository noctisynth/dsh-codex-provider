import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { RequestMessage } from '@deepseek-ai/dsh-llm'
import { LlmError, offloadedImageText } from '@deepseek-ai/dsh-llm'

/** Resolve durable images only for this request; never mutate the session history. */
export async function projectImages(
  messages: readonly RequestMessage[],
  attachments: Pick<AttachmentStore, 'readImage'> | undefined,
  signal?: AbortSignal,
) {
  const projected = []
  for (const message of messages) {
    const content = []
    for (const block of message.content) {
      signal?.throwIfAborted()
      if (block.type !== 'image') {
        content.push(block)
        continue
      }
      if (block.offloaded) {
        content.push({ type: 'text', text: offloadedImageText(block.attachment) })
        continue
      }
      if (message.role !== 'user' && message.role !== 'tool')
        throw new LlmError('Only user and tool messages support image input.', 'INVALID_REQUEST')
      if (!attachments)
        throw new LlmError('DSH attachment service is unavailable.', 'INVALID_REQUEST')
      const image = await attachments.readImage(block.attachment, signal)
      signal?.throwIfAborted()
      content.push({
        type: 'image',
        imageUrl: `data:${image.ref.mediaType};base64,${Buffer.from(image.data).toString('base64')}`,
      })
    }
    projected.push({ ...message, content })
  }
  return projected
}
