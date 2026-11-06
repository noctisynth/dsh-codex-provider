import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { ConfigEditor } from '@deepseek-ai/dsh-config-editor'
import { SettingsForms } from '@deepseek-ai/dsh-settings'
import { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import * as plugin from '../plugin/index.ts'

test('sidebar preference persists through host settings without remounting authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-sidebar-settings-'))
  assert.equal(dirname(directory), resolve(tmpdir()))
  const profileDirectory = join(directory, 'profile')
  const profile: ProfileContext = {
    name: 'test', dir: profileDirectory, home: directory, cwd: directory,
    patchPath: join(profileDirectory, 'cordis.patch.yml'),
    installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)),
    startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  }
  initProfile(profileDirectory, [])
  await writeFile(profile.patchPath, JSON.stringify([{ insert: [{ id: 'codex-provider', name: 'cordis:codex-provider' }] }]))
  await writeFile(join(directory, 'cordis.yml'), '[]\n')
  let mounts = 0
  async function start() {
    const ctx = new Context()
    ctx.provide('attachments', {} as never)
    ctx.provide('profileContext', profile)
    ctx.provide('credentials', { readRecord: async () => undefined } as unknown as Context['credentials'])
    ctx.provide('llm', { registerAdapter() {} } as unknown as Context['llm'])
    const authorization = ctx.plugin(AuthorizationService)
    const loader = ctx.plugin(Loader)
    await Promise.all([authorization.await(), loader.await()])
    ctx.loader.builtins['codex-provider'] = {
      ...plugin,
      apply(child: Context) { mounts++; plugin.apply(child) },
    }
    await mountRootInclude(ctx, join(directory, 'cordis.yml'), readProfilePatches('dsh', profile))
    await ctx.loader.await()
    await Promise.all([...ctx.loader.entries()].map(entry => entry.fiber?.await()))
    const editor = ctx.plugin(ConfigEditor)
    const settings = ctx.plugin(SettingsForms)
    await Promise.all([editor.await(), settings.await()])
    return { ctx, async close() {
      await settings.dispose()
      await editor.dispose()
      await loader.dispose()
      await authorization.dispose()
    } }
  }
  let host: Awaited<ReturnType<typeof start>> | undefined
  try {
    host = await start()
    const descriptor = host.ctx.settings.describe().find(row => row.ns === 'codex-provider')
    assert.ok(descriptor)
    assert.deepEqual(descriptor.value, { sidebarAccount: 'deepseek' })
    assert.equal(descriptor.autoGenerate, false)
    const entry = host.ctx.configEditor.entries().find(row => row.options.id === 'codex-provider')
    assert.ok(entry)
    const originalFiber = entry.fiber
    await host.ctx.settings.mutate('codex-provider', [{ op: 'set', path: ['sidebarAccount'], value: 'chatgpt' }], descriptor.revision)
    assert.deepEqual(host.ctx.settings.describe().find(row => row.ns === 'codex-provider')?.value, { sidebarAccount: 'chatgpt' })
    assert.equal(entry.fiber, originalFiber)
    assert.equal(mounts, 1)
    assert.match(await readFile(profile.patchPath, 'utf8'), /sidebarAccount: chatgpt/)
    await host.close()
    host = await start()
    assert.deepEqual(host.ctx.settings.describe().find(row => row.ns === 'codex-provider')?.value, { sidebarAccount: 'chatgpt' })
    await host.ctx.settings.mutate('codex-provider', [{ op: 'set', path: ['sidebarAccount'], value: 'deepseek' }])
    assert.deepEqual(host.ctx.settings.describe().find(row => row.ns === 'codex-provider')?.value, { sidebarAccount: 'deepseek' })
    assert.equal(mounts, 2)
  } finally {
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
