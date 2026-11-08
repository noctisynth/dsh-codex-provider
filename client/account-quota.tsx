import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Quota } from '../index.cjs'
import { Button } from './ui/button.tsx'
import { Skeleton } from './ui/skeleton.tsx'

const planNames: Record<string, string> = {
  pro: 'Pro',
  plus: 'Plus',
  free: 'Free',
  business: 'Business',
  enterprise: 'Enterprise',
  team: 'Team',
}

export function AccountQuota({
  id,
  rpc,
  t,
}: {
  id: string
  rpc: ClientConnectionRpc
  t: Translate
}) {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, refresh] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision requests a fresh quota snapshot.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setQuota(null)
    void rpc
      .call('/api', 'codex-provider/quota', { id }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (!result.ok) throw new Error('Quota unavailable')
        setQuota(result.value as Quota)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id, rpc, revision])

  return (
    <div className='cp:basis-full cp:space-y-2 cp:rounded-lg cp:bg-muted/40 cp:px-3 cp:py-2.5 cp:text-xs'>
      <div className='cp:flex cp:items-center cp:justify-between cp:gap-2'>
        <span className='cp:font-medium'>
          {t('Subscription usage')}
          {quota?.plan && <> · {t(planNames[quota.plan] ?? quota.plan)}</>}
        </span>
        <Button
          size='sm'
          variant='ghost'
          disabled={loading}
          aria-label={t('Refresh usage')}
          onClick={() => refresh((value) => value + 1)}
        >
          <RefreshCw aria-hidden='true' className='cp:size-3.5' />
          {t('Refresh')}
        </Button>
      </div>
      {loading && <Skeleton className='cp:h-3 cp:w-2/3' />}
      {error && (
        <p role='status' className='cp:m-0 cp:text-muted-foreground'>
          {t('Usage is unavailable. Try refreshing.')}
        </p>
      )}
      {quota?.windows.map((window) => (
        <div key={`${window.name}-${window.windowSeconds}`} className='cp:space-y-1'>
          <div className='cp:flex cp:flex-wrap cp:justify-between cp:gap-x-3 cp:gap-y-1'>
            <span>
              {t(window.name)} ·{' '}
              {window.windowSeconds >= 86400
                ? t('{days}-day window', { days: window.windowSeconds / 86400 })
                : t('{hours}-hour window', { hours: window.windowSeconds / 3600 })}
            </span>
            <span>
              {t('Remaining')} {Math.round(window.remainingPercent)}%
            </span>
          </div>
          <progress
            aria-label={t('Remaining usage')}
            max={100}
            value={window.remainingPercent}
            className='cp:block cp:h-1 cp:w-full cp:overflow-hidden cp:rounded-full cp:[&::-webkit-progress-bar]:bg-muted cp:[&::-webkit-progress-value]:bg-foreground/60 cp:[&::-moz-progress-bar]:bg-foreground/60'
          />
          {window.resetsAt && (
            <p className='cp:m-0 cp:text-muted-foreground'>
              {t('Resets')} {new Date(window.resetsAt * 1000).toLocaleString()}
            </p>
          )}
        </div>
      ))}
      {quota && (quota.unlimitedCredits || quota.credits != null) && (
        <p className='cp:m-0 cp:text-muted-foreground'>
          {t('Credits')} · {quota.unlimitedCredits ? t('Unlimited') : quota.credits}
        </p>
      )}
      {quota && !quota.windows.length && !quota.unlimitedCredits && quota.credits == null && (
        <p className='cp:m-0 cp:text-muted-foreground'>{t('No usage data returned.')}</p>
      )}
    </div>
  )
}
