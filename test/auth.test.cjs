const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ChatGptClient, Cancellation, createHostId, describeSession } = require('../index.js')

test('aborted native sign-in rejects without opening a browser or making discovery requests', async () => {
  const client = new ChatGptClient()
  const cancellation = new Cancellation()
  cancellation.cancel()
  await assert.rejects(client.beginLogin(createHostId(), undefined, cancellation), /sign-in cancelled/)
})

function sessionRecord() {
  return JSON.stringify({
    client_id: 'test-issued-client', issuer: 'https://auth.openai.com', subject: 'test-subject',
    email: 'test@example.invalid', host_id: createHostId(), id_token: 'test-id-token', nonce: 'test-nonce',
    access_token: 'test-access-token', refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600, scopes: ['chatgpt.tokens.use.direct'],
  })
}

test('a fresh native session retains its record without a refresh request', async () => {
  const record = sessionRecord()
  const result = await new ChatGptClient().renewSession(record, new Cancellation())
  assert.deepEqual(JSON.parse(result.record), JSON.parse(record))
  assert.equal(result.account.hasCredentials, true)
  assert.equal(result.account.planUsageAuthorized, true)
  assert.equal('access_token' in result.account, false)
})

test('local logout clears tokens and retains registration when remote revocation is unconfirmed', async () => {
  const record = sessionRecord()
  const cancellation = new Cancellation()
  cancellation.cancel()
  const result = await new ChatGptClient().logoutSession(record, cancellation)
  assert.equal(result.revocationConfirmed, false)
  const cleared = JSON.parse(result.record)
  assert.equal(cleared.client_id, JSON.parse(record).client_id)
  assert.equal(cleared.subject, JSON.parse(record).subject)
  for (const field of ['access_token', 'refresh_token', 'id_token', 'nonce']) assert.equal(cleared[field], '')
  assert.equal(describeSession(result.record).hasCredentials, false)
})

test('invalid host identifiers fail at the native boundary', async () => {
  await assert.rejects(new ChatGptClient().beginLogin('invalid-host', undefined, new Cancellation()), /host ID/)
})
