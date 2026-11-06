const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ChatGptClient } = require('../index.js')

test('generated loader registers the native client and async catalog method', () => {
  const client = new ChatGptClient()
  assert.equal(typeof client.listModels, 'function')
})
