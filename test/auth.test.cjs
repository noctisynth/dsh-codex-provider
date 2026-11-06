const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ChatGptClient, Cancellation, createHostId } = require('../index.js')

test('aborted native sign-in rejects without opening a browser or making discovery requests', async () => {
  const client = new ChatGptClient()
  const cancellation = new Cancellation()
  cancellation.cancel()
  await assert.rejects(client.beginLogin(createHostId(), undefined, cancellation), /sign-in cancelled/)
})

test('invalid host identifiers fail at the native boundary', async () => {
  await assert.rejects(new ChatGptClient().beginLogin('invalid-host', undefined, new Cancellation()), /host ID/)
})
