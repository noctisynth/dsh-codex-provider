import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { quotaStore } from './quota-store.ts'

export function useQuotaInterval(form: ConfigForm<SidebarPreference>) {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
  )
  return Number(snapshot.value?.quotaRefresh ?? '5')
}

export function useQuota(rpc: ClientConnectionRpc, id: string | undefined, minutes: number) {
  const store = useMemo(() => (id ? quotaStore(rpc, id) : undefined), [rpc, id])
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.snapshot ?? emptySnapshot,
  )
  useEffect(() => store?.watch(minutes), [store, minutes])
  return { ...snapshot, refresh: store?.refresh }
}

const empty = { quota: null, loading: false, error: false }
const emptySnapshot = () => empty
const subscribeEmpty = () => () => {}

export function useQuotaClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  return now
}
