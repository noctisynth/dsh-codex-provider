import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NapiCli, readNapiConfig } from '@napi-rs/cli'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

function loadNative(loader: string): void {
  const env = { ...process.env }
  delete env.NAPI_RS_NATIVE_LIBRARY_PATH
  delete env.NAPI_RS_FORCE_WASI
  execFileSync(
    process.execPath,
    [
      '--input-type=commonjs',
      '-e',
      `const assert = require('node:assert/strict');
const native = require(process.argv[1]);
assert.equal(native.__napiBindingTarget, 'native');
for (const name of ['ChatGptClient', 'Cancellation', 'LoginAttempt', 'createHostId']) {
  assert.equal(typeof native[name], 'function', name);
}`,
      loader,
    ],
    { env, stdio: 'pipe' },
  )
}

test('packed plugin contains runtime files and resolves local and platform-package native bindings', async (t) => {
  const config = await readNapiConfig(join(projectRoot, 'package.json'))
  const archive = join(projectRoot, `${config.packageJson.name}-${config.packageJson.version}.tgz`)
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-package-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync('tar', ['-xzf', archive, '-C', root])
  const packed = join(root, 'package')
  const manifest = JSON.parse(await readFile(join(packed, 'package.json'), 'utf8'))
  assert.equal(manifest.name, config.packageJson.name)
  assert.equal(manifest.version, config.packageJson.version)
  for (const entry of [
    manifest.main,
    manifest.exports['./client'],
    'cordis.patch.yml',
    'index.cjs',
    'index.d.cts',
    'client/ui/SHADCN-LICENSE.md',
    'client/ui/BASE-UI-LICENSE.md',
    'OPENAI-BRAND.md',
  ]) {
    assert.ok((await stat(join(packed, entry))).size > 0, entry)
  }

  await t.test('official loader loads the native binary from the packed root', () => {
    loadNative(join(packed, 'index.cjs'))
  })

  await t.test(
    'official loader also resolves the generated platform package without a local binary',
    async () => {
      const target = config.targets.find(
        (candidate) => candidate.platform === process.platform && candidate.arch === process.arch,
      )
      assert.ok(target, 'the test runtime must match a declared native target')
      const fallback = join(root, 'fallback')
      await cp(packed, fallback, {
        recursive: true,
        filter: (source) => !source.endsWith('.node'),
      })
      await new NapiCli().createNpmDirs({ cwd: fallback })
      const platformRoot = join(fallback, 'npm', target.platformArchABI)
      await cp(
        join(packed, `${config.binaryName}.${target.platformArchABI}.node`),
        join(platformRoot, `${config.binaryName}.${target.platformArchABI}.node`),
      )
      await cp(
        platformRoot,
        join(fallback, 'node_modules', `${config.packageName}-${target.platformArchABI}`),
        { recursive: true },
      )
      loadNative(join(fallback, 'index.cjs'))
    },
  )
})
