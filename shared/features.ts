export type SearchMode = 'off' | 'chatgpt' | 'all'
export const imageDetails = ['auto', 'low', 'high', 'original'] as const
export type ImageDetail = (typeof imageDetails)[number]
export type PreferenceKey = 'sidebarAccount' | 'codexReview' | 'searchMode' | 'imageDetail'

export interface FeaturePreferences {
  codexReview?: boolean
  searchMode?: SearchMode
  imageDetail?: ImageDetail
}

declare module '@deepseek-ai/dsh-llm' {
  interface LlmRequestPurposeMap {
    'auto-review': true
    'web-search': true
  }
}
