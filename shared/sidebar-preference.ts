import type { FeaturePreferences } from './features.ts'

export interface SidebarPreference extends FeaturePreferences {
  sidebarAccount: 'deepseek' | 'chatgpt'
}
