import { createHostId } from '../index.cjs'

export const sessionRecord = () =>
  JSON.stringify({
    client_id: 'test-issued-client',
    issuer: 'https://auth.openai.com',
    subject: 'test-subject',
    email: 'test@example.invalid',
    host_id: createHostId(),
    id_token: 'test-id-token',
    nonce: 'test-nonce',
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    scopes: ['chatgpt.tokens.use.direct'],
  })
