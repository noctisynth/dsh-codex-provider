import { useState, useSyncExternalStore } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import type { SearchMode } from '../shared/features.ts'
import { setPreference } from './preferences.ts'
import { Button } from './ui/button.tsx'

export function FeatureSettings({ form, rpc }: { form: ConfigForm<SidebarPreference>; rpc: ClientConnectionRpc }) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function save(key: 'codexReview' | 'searchMode', value: boolean | SearchMode) {
    setSaving(true); setError('')
    try { await setPreference(rpc, key, value) }
    catch { setError('未能保存设置，请检查宿主配置后重试。') }
    finally { setSaving(false) }
  }
  const disabled = saving || snapshot.status !== 'ready' || !snapshot.writable
  return <div className="cp:mt-5 cp:space-y-5 cp:border-0 cp:border-t cp:border-solid cp:border-border cp:pt-4">
    <div>
      <div className="cp:flex cp:items-center cp:justify-between cp:gap-3">
        <span className="cp:font-medium">由 ChatGPT 审批</span>
        <Button size="xs" variant="outline" role="switch" aria-label="由 ChatGPT 审批" aria-checked={snapshot.value?.codexReview === true}
          disabled={disabled} onClick={() => save('codexReview', !snapshot.value?.codexReview)}>{snapshot.value?.codexReview ? '已开启' : '已关闭'}</Button>
      </div>
      <p className="cp:mt-2 cp:mb-0 cp:text-xs cp:leading-relaxed cp:text-muted-foreground">保留当前沙箱，仅将需要审批的操作交给 ChatGPT。适用于所有会话；审查上下文会发送至当前 ChatGPT 账号并消耗其用量。关闭后恢复人工审批。</p>
    </div>
    <div>
      <div className="cp:font-medium">网页搜索</div>
      <div role="group" aria-label="网页搜索范围" className="cp:mt-2 cp:flex cp:flex-wrap cp:gap-1">
        {([['off', '关闭'], ['chatgpt', '仅 ChatGPT'], ['all', '所有模型']] as const).map(([value, label]) =>
          <Button key={value} size="xs" disabled={disabled} aria-pressed={(snapshot.value?.searchMode ?? 'off') === value}
            variant={(snapshot.value?.searchMode ?? 'off') === value ? 'outline' : 'ghost'} onClick={() => save('searchMode', value)}>{label}</Button>)}
      </div>
      <p className="cp:mt-2 cp:mb-0 cp:text-xs cp:leading-relaxed cp:text-muted-foreground">使用 ChatGPT 官方搜索。所有模型模式会切换 DSH 搜索源，离开该模式时恢复原来源。其它模型每次搜索会额外调用 ChatGPT 并消耗其用量。</p>
    </div>
    {error && <p role="alert" className="cp:m-0 cp:text-xs cp:text-destructive">{error}</p>}
  </div>
}
