import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import { RefreshCw } from 'lucide-react'
import { quotaPlan, quotaReset, quotaWindow } from './quota-format.ts'
import { Button } from './ui/button.tsx'
import { Skeleton } from './ui/skeleton.tsx'
import { useQuota, useQuotaClock } from './use-quota.ts'

export function AccountQuota({
  id,
  rpc,
  t,
  minutes,
}: {
  id: string
  rpc: ClientConnectionRpc
  t: Translate
  minutes: number
}) {
  const { quota, error, loading, refresh } = useQuota(rpc, id, minutes)
  const now = useQuotaClock()

  return (
    <div className='cp:basis-full cp:space-y-3 cp:rounded-[var(--dsw-radius-md)] cp:bg-muted/40 cp:px-3 cp:py-2.5 cp:text-xs'>
      <div className='cp:flex cp:items-center cp:justify-between cp:gap-2'>
        <span className='cp:font-medium'>
          {t('Subscription usage')}
          {quota?.plan && <> · {t(quotaPlan(quota.plan))}</>}
        </span>
        <Button
          size='sm'
          variant='ghost'
          disabled={loading}
          aria-label={t('Refresh usage')}
          onClick={() => void refresh?.()}
        >
          <RefreshCw aria-hidden='true' className='cp:size-3.5' />
          {t('Refresh')}
        </Button>
      </div>
      {loading && !quota && <Skeleton className='cp:h-3 cp:w-2/3' />}
      {error && (
        <p role='status' className='cp:m-0 cp:text-muted-foreground'>
          {t('Usage is unavailable. Try refreshing.')}
        </p>
      )}
      {quota?.windows.map((window) => (
        <div key={`${window.name}-${window.windowSeconds}`} className='cp:space-y-1'>
          <div className='cp:font-medium'>
            {t(window.name)} · {quotaWindow(window, t)}
          </div>
          <div className='cp:flex cp:flex-wrap cp:justify-between cp:gap-x-3 cp:gap-y-1 cp:text-muted-foreground'>
            <span>{window.resetsAt != null ? quotaReset(window.resetsAt, now, t) : null}</span>
            <span>
              {t('Remaining')} {Math.round(window.remainingPercent)}%
            </span>
          </div>
          <progress
            aria-label={t('Remaining usage')}
            max={100}
            value={window.remainingPercent}
            className='cp:block cp:h-2 cp:w-full cp:overflow-hidden cp:rounded-full cp:[&::-webkit-progress-bar]:bg-muted cp:[&::-webkit-progress-value]:bg-foreground cp:[&::-moz-progress-bar]:bg-foreground'
          />
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
