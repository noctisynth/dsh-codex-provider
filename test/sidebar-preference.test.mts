import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Loader } from '@deepseek-ai/cordis-plugin-loader'
import {
  initProfile,
  mountRootInclude,
  type ProfileContext,
  readProfilePatches,
} from '@deepseek-ai/dsh-app-boot'
import { AuthorizationService } from '@deepseek-ai/dsh-authorization'
import { ConfigEditor } from '@deepseek-ai/dsh-config-editor'
import { SettingsForms } from '@deepseek-ai/dsh-settings'
import { WebRuntime } from '@deepseek-ai/dsh-web'
import * as plugin from '../plugin/index.ts'

test('sidebar preference persists through host settings without remounting authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-sidebar-settings-'))
  assert.equal(dirname(directory), resolve(tmpdir()))
  const profileDirectory = join(directory, 'profile')
  const profile: ProfileContext = {
    name: 'test',
    dir: profileDirectory,
    home: directory,
    cwd: directory,
    patchPath: join(profileDirectory, 'cordis.patch.yml'),
    installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)),
    startedBundles: [],
    overlays: [],
    telemetryDisabledEnv: undefined,
  }
  initProfile(profileDirectory, [])
  await writeFile(
    profile.patchPath,
    JSON.stringify([
      {
        insert: [
          {
            id: 'web',
            name: 'cordis:@deepseek-ai/dsh-web',
            config: { searchProvider: 'original' },
          },
          { id: 'codex-provider', name: 'cordis:codex-provider' },
        ],
      },
    ]),
  )
  await writeFile(join(directory, 'cordis.yml'), '[]\n')
  let mounts = 0
  async function start() {
    const ctx = new Context()
    const routes = new Map<string, (request: Request) => Promise<Response>>()
    ctx.provide('connection', {
      fetch: {
        register(route: { path: string; fetch(request: Request): Promise<Response> }) {
          routes.set(route.path, route.fetch)
          return () => routes.delete(route.path)
        },
      },
    } as unknown as Context['connection'])
    ctx.provide('attachments', {} as never)
    ctx.provide('profileContext', profile)
    ctx.provide('credentials', {
      readRecord: async () => undefined,
    } as unknown as Context['credentials'])
    ctx.provide('llm', { registerAdapter() {} } as unknown as Context['llm'])
    const authorization = ctx.plugin(AuthorizationService)
    const loader = ctx.plugin(Loader)
    await Promise.all([authorization.await(), loader.await()])
    ctx.loader.builtins['@deepseek-ai/dsh-web'] = WebRuntime
    ctx.loader.builtins['codex-provider'] = {
      ...plugin,
      apply(child: Context, config: plugin.Config) {
        mounts++
        plugin.apply(child, config)
      },
    }
    await mountRootInclude(ctx, join(directory, 'cordis.yml'), readProfilePatches('dsh', profile))
    await ctx.loader.await()
    await Promise.all([...ctx.loader.entries()].map((entry) => entry.fiber?.await()))
    const editor = ctx.plugin(ConfigEditor)
    const settings = ctx.plugin(SettingsForms)
    await Promise.all([editor.await(), settings.await()])
    // Nested plugin effects can finish a host config write after the service becomes available.
    for (let i = 0; i < 50; i++) {
      const config = ctx.settings.describe().find((row) => row.ns === 'codex-provider')?.value as {
        searchMode?: string
      }
      const web = ctx.settings.describe().find((row) => row.ns === 'web')?.value as {
        searchProvider?: string
      }
      if (config?.searchMode !== 'all' || web?.searchProvider === 'chatgpt') break
      await setTimeout(20)
    }
    const set = async (key: string, value: unknown) => {
      const handler = routes.get('/api/codex-provider/preference')
      assert.ok(handler)
      const response = await handler(
        new Request('http://fixture/api/codex-provider/preference', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'fixture',
            method: 'codex-provider/preference',
            payload: { key, value },
          }),
        }),
      )
      const result = await response.json()
      assert.equal(result.result.ok, true, JSON.stringify(result))
    }
    return {
      ctx,
      set,
      async close() {
        await settings.dispose()
        await editor.dispose()
        await loader.dispose()
        await authorization.dispose()
      },
    }
  }
  let host: Awaited<ReturnType<typeof start>> | undefined
  try {
    host = await start()
    const descriptor = host.ctx.settings.describe().find((row) => row.ns === 'codex-provider')
    assert.ok(descriptor)
    assert.deepEqual(descriptor.value, {
      sidebarAccount: 'deepseek',
      codexReview: false,
      searchMode: 'off',
      imageDetail: 'auto',
    })
    assert.equal(descriptor.autoGenerate, false)
    const entry = host.ctx.configEditor.entries().find((row) => row.options.id === 'codex-provider')
    assert.ok(entry)
    const originalFiber = entry.fiber
    await host.set('sidebarAccount', 'chatgpt')
    assert.deepEqual(
      host.ctx.settings.describe().find((row) => row.ns === 'codex-provider')?.value,
      { sidebarAccount: 'chatgpt', codexReview: false, searchMode: 'off', imageDetail: 'auto' },
    )
    assert.equal(entry.fiber, originalFiber)
    assert.equal(mounts, 1)
    assert.match(await readFile(profile.patchPath, 'utf8'), /sidebarAccount: chatgpt/)
    await host.close()
    host = await start()
    assert.deepEqual(
      host.ctx.settings.describe().find((row) => row.ns === 'codex-provider')?.value,
      { sidebarAccount: 'chatgpt', codexReview: false, searchMode: 'off', imageDetail: 'auto' },
    )
    await host.set('sidebarAccount', 'deepseek')
    assert.deepEqual(
      host.ctx.settings.describe().find((row) => row.ns === 'codex-provider')?.value,
      { sidebarAccount: 'deepseek', codexReview: false, searchMode: 'off', imageDetail: 'auto' },
    )
    assert.equal(mounts, 2)
    await host.set('searchMode', 'all')
    assert.equal(readConfig<{ searchProvider: string }>(host.ctx, 'web').searchProvider, 'chatgpt')
    await host.set('searchMode', 'chatgpt')
    assert.equal(readConfig<{ searchProvider: string }>(host.ctx, 'web').searchProvider, 'original')
    await host.set('codexReview', true)
    assert.equal(readConfig<{ codexReview: boolean }>(host.ctx, 'codex-provider').codexReview, true)
    await host.set('searchMode', 'all')
    await host.ctx.settings.update('web', { searchProvider: 'user-choice' })
    await host.set('imageDetail', 'original')
    await host.set('searchMode', 'off')
    assert.equal(
      readConfig<{ searchProvider: string }>(host.ctx, 'web').searchProvider,
      'user-choice',
    )
    await host.set('searchMode', 'all')
    await host.close()
    host = await start()
    assert.equal(readConfig<{ searchProvider: string }>(host.ctx, 'web').searchProvider, 'chatgpt')
    assert.equal(
      readConfig<{ imageDetail: string }>(host.ctx, 'codex-provider').imageDetail,
      'original',
    )
    await host.set('searchMode', 'off')
    assert.equal(
      readConfig<{ searchProvider: string }>(host.ctx, 'web').searchProvider,
      'user-choice',
    )
  } finally {
    await host?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

function readConfig<T>(ctx: Context, namespace: string): T {
  const descriptor = ctx.settings.describe().find((row) => row.ns === namespace)
  assert.ok(descriptor, `Expected configuration namespace: ${namespace}`)
  return descriptor.value as T
}
