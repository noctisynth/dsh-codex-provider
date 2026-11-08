import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import type { QuotaWindow } from '../index.cjs'

const planNames: Record<string, string> = {
  plus: 'Plus',
  free: 'Free',
  business: 'Business',
  enterprise: 'Enterprise',
  team: 'Team',
}

export function quotaPlan(plan: string) {
  return plan.startsWith('pro') ? 'Pro' : (planNames[plan] ?? plan)
}

export function quotaWindow(window: QuotaWindow, t: Translate) {
  if (window.windowSeconds === 604800) return t('Weekly')
  return window.windowSeconds >= 86400
    ? t('{days}-day window', { days: window.windowSeconds / 86400 })
    : t('{hours}-hour window', { hours: window.windowSeconds / 3600 })
}

export function quotaReset(resetsAt: number, now: number, t: Translate) {
  const minutes = Math.ceil((resetsAt * 1000 - now) / 60000)
  if (minutes <= 0) return t('Resets soon')
  if (minutes >= 1440)
    return t('Resets in {days}d {hours}h', {
      days: Math.floor(minutes / 1440),
      hours: Math.floor((minutes % 1440) / 60),
    })
  if (minutes >= 60)
    return t('Resets in {hours}h {minutes}m', {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    })
  return t('Resets in {minutes}m', { minutes })
}
