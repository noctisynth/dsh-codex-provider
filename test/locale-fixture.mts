import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'

export async function localeFixture(language: string) {
  const require = createRequire(import.meta.url)
  let Runtime: typeof LocaleRuntime | undefined
  runInNewContext(
    await readFile(require.resolve('@deepseek-ai/dsh-client-locale/client'), 'utf8'),
    {
      window: {
        __ModuleLoader__: {
          load(entry: { factory(require: NodeRequire): { LocaleRuntime: typeof LocaleRuntime } }) {
            Runtime = entry.factory(((name: string) => {
              if (name === 'react' || name === 'react/jsx-runtime') return require(name)
              assert.ok(
                ['@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-store'].includes(
                  name,
                ),
              )
              // This test uses the public dictionary runtime, not the host's Language row UI.
              return {}
            }) as NodeRequire).LocaleRuntime
          },
        },
      },
    },
  )
  assert.ok(Runtime)
  return new Runtime(new Context(), undefined, { languages: [language], preference: null })
}
