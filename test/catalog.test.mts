import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ChatGptClient } from '../index.cjs'

test('generated loader registers the native client and async catalog method', () => {
  const client = new ChatGptClient({})
  assert.equal(typeof client.listModels, 'function')
})
