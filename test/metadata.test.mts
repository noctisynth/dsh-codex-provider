import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readPluginMeta } from '@deepseek-ai/dsh-app-boot'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

test('source and npm package expose localized metadata and the SVG icon', async (t) => {
  const sourceManifest = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const icon = await readFile(join(projectRoot, 'icon.svg'))
  const root = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const archive = join(projectRoot, `${sourceManifest.name}-${sourceManifest.version}.tgz`)
  execFileSync('tar', ['-xzf', archive, '-C', root])

  for (const [name, directory] of [
    ['source', projectRoot],
    ['npm package', join(root, 'package')],
  ]) {
    await t.test(name, async () => {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      assert.equal(manifest.exports['.'], './lib/index.mjs')
      assert.equal(manifest.exports['./client'], './lib/client.js')
      assert.equal(manifest.exports['./package.json'], './package.json')

      const meta = readPluginMeta(
        sourceManifest.name,
        pathToFileURL(join(directory, 'package.json')).href,
      )
      assert.ok(meta)
      assert.equal(meta.error, undefined)
      assert.deepEqual(meta.title, { en: 'ChatGPT Rust', zh: 'ChatGPT Rust' })
      assert.deepEqual(meta.description, {
        en: 'Use your ChatGPT account for model conversations, image input, and web search in DSH.',
        zh: '在 DSH 中使用 ChatGPT 账号，支持模型对话、图片输入和网页搜索。',
      })
      assert.equal(meta.icon, `data:image/svg+xml;base64,${icon.toString('base64')}`)
    })
  }
})
