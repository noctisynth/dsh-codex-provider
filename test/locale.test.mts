import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dictionaries, localeNamespace } from '../client/locales/index.ts'
import { loginMethodLabel } from '../shared/login-methods.ts'
import { localeFixture } from './locale-fixture.mts'

test('DSH locale translates Chinese, falls back to English and retains account method distinctions', async () => {
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
  const locale = await localeFixture('zh-CN')
  const release = locale.register(localeNamespace, dictionaries)
  const t = locale.bind(localeNamespace)
  assert.equal(t('Back'), '返回')
  assert.equal(t(loginMethodLabel('siwc')), 'SIWC')
  assert.equal(t(loginMethodLabel('codex-browser')), 'Codex · 浏览器（过时）')
  assert.equal(t('Sign in again as {name}', { name: 'Example User' }), '重新登录 Example User')
  locale.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' })
  locale.setLocale('fr')
  assert.equal(t('Back'), 'Back')
  assert.equal(t(loginMethodLabel('codex-device')), 'Codex · Device code (legacy)')
  assert.equal(t('External provider diagnostic'), 'External provider diagnostic')
  locale.setLocale('zh')
  assert.equal(t('Back'), '返回')
  release()
  const fallback = await localeFixture('ja-JP')
  fallback.register(localeNamespace, dictionaries)
  assert.equal(fallback.bind(localeNamespace)('Back'), 'Back')
})
