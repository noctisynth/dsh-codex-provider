export type SearchMode = 'off' | 'chatgpt' | 'all'
export const imageDetails = ['auto', 'low', 'high', 'original'] as const
export type ImageDetail = (typeof imageDetails)[number]
export const quotaRefreshIntervals = ['0', '1', '5', '15'] as const
export type QuotaRefreshInterval = (typeof quotaRefreshIntervals)[number]
export type PreferenceKey =
  | 'sidebarAccount'
  | 'codexReview'
  | 'searchMode'
  | 'imageDetail'
  | 'quotaRefresh'

export interface FeaturePreferences {
  codexReview?: boolean
  searchMode?: SearchMode
  imageDetail?: ImageDetail
  quotaRefresh?: QuotaRefreshInterval
}

declare module '@deepseek-ai/dsh-llm' {
  interface LlmRequestPurposeMap {
    'auto-review': true
    'web-search': true
  }
}
