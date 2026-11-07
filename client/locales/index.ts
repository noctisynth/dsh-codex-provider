import en from './en.ts'
import zh from './zh.ts'

export const localeNamespace = 'codex-provider'
export const dictionaries = { en, zh }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'codex-provider': string
  }
}
