export type SearchMode = 'off' | 'chatgpt' | 'all'
export type PreferenceKey = 'sidebarAccount' | 'codexReview' | 'searchMode'

export interface FeaturePreferences {
  codexReview?: boolean
  searchMode?: SearchMode
}

declare module '@deepseek-ai/dsh-llm' {
  interface LlmRequestPurposeMap {
    'auto-review': true
    'web-search': true
  }
}
