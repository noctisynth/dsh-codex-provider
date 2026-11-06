import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

test('the shipped browser factory registers the settings and plugin configuration entries', async () => {
  let loaded: { id: string; factory: (require: NodeRequire) => { apply(ctx: unknown): void } } | undefined
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value: typeof loaded) { loaded = value } } },
  })
  assert.ok(loaded)
  assert.equal(loaded.id, 'dsh-codex-provider')
  const plugin = loaded.factory(createRequire(import.meta.url))
  const slots: { name: string; id?: string; key?: string }[] = []
  const rpc = {}
  plugin.apply({
    get: () => ({ rpc }),
    slots: { inject: (_name: string, mount: () => void) => mount(), register: (entry: typeof slots[number]) => { slots.push(entry) } },
  })
  assert.ok(slots.some(entry => entry.name === 'settings.section' && entry.id === 'codex-provider'))
  assert.ok(slots.some(entry => entry.name === 'plugins.bundle.config' && entry.key === 'dsh-codex-provider'))
})
