import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { evaluatePluginCompatibility, getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const peerOnlyManifest = { ...manifest, engines: { node: manifest.engines.node } }

test('DSH admission preserves the 0.2.2 family and adds only the supported 0.2.3 alpha', () => {
  for (const version of [
    '0.2.2-rc.2',
    '0.2.2-rc.3',
    '0.2.2-rc.4',
    '0.2.2-rc.5',
    '0.2.2-rc.99',
    '0.2.2',
    '0.2.2+build.1',
    '0.2.3-alpha.2',
    '0.2.3-alpha.2+build.1',
  ]) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version)
    assert.equal(evaluatePluginCompatibility(peerOnlyManifest, {}, version), undefined, version)
  }
  for (const version of [
    '0.2.1',
    '0.2.2-alpha.3',
    '0.2.2-rc.1',
    '0.2.3-0',
    '0.2.3-alpha.1',
    '0.2.3-alpha.2.1',
    '0.2.3-alpha.3',
    '0.2.3-rc.1',
    '0.2.3',
    '0.3.0-alpha.1',
    '0.3.0',
  ]) {
    const issue = evaluatePluginCompatibility(manifest, {}, version)
    assert.ok(issue, version)
    assert.equal(issue.exempted, false, version)
    assert.deepEqual(issue.requirements, { 'engines.dsh': manifest.engines.dsh })
    const peerIssue = evaluatePluginCompatibility(peerOnlyManifest, {}, version)
    assert.ok(peerIssue, version)
    assert.equal(peerIssue.exempted, false, version)
    assert.deepEqual(
      peerIssue.requirements,
      Object.fromEntries(
        Object.entries(manifest.peerDependencies).filter(([name]) =>
          name.startsWith('@deepseek-ai/dsh-'),
        ),
      ),
    )
  }
})

test('DSH peer ranges agree with admission and the development SDK uses one exact release', () => {
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(range, manifest.engines.dsh, name)
  }
  const pinned = manifest.devDependencies['@deepseek-ai/dsh-app-boot']
  assert.equal(getDshRuntimeVersion(), pinned)
  for (const [name, version] of Object.entries(manifest.devDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(version, pinned, name)
  }
})
