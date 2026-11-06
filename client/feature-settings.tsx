import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import type { PreferenceKey } from '../shared/features.ts'
import { setPreference } from './preferences.ts'
import { Switch } from './ui/switch.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx'

function SettingRow({ title, description, error, children }: { title: string; description: string; error?: string; children: ReactNode }) {
  return <div className="cp:flex cp:items-center cp:justify-between cp:gap-6 cp:border-0 cp:border-b cp:border-solid cp:border-border cp:py-4 cp:last:border-b-0">
    <div className="cp:min-w-0">
      <div className="cp:text-sm cp:leading-5">{title}</div>
      <p className="cp:mt-1 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-muted-foreground">{description}</p>
      {error && <p role="alert" className="cp:mt-2 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-destructive">{error}</p>}
    </div>
    {children}
  </div>
}

function SettingSelect({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly (readonly [string, string])[]; disabled: boolean; onChange(value: string): void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return <Select value={value} disabled={disabled} onValueChange={onChange} onOpenChange={open => {
    if (open) setContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"], dialog') ?? null)
  }}>
    <SelectTrigger aria-label={label} ref={triggerRef}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent container={container}>
      {options.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
    </SelectContent>
  </Select>
}

export function FeatureSettings({ form, rpc }: { form: ConfigForm<SidebarPreference>; rpc: ClientConnectionRpc }) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot())
  const [saving, setSaving] = useState<PreferenceKey>()
  const [error, setError] = useState<{ key: PreferenceKey; message: string }>()
  async function save(key: PreferenceKey, value: string | boolean) {
    setSaving(key); setError(undefined)
    try { await setPreference(rpc, key, value) }
    catch (cause) { setError({ key, message: cause instanceof Error ? cause.message : '未能保存设置，请重试。' }) }
    finally { setSaving(undefined) }
  }
  const disabled = !!saving || snapshot.status !== 'ready' || !snapshot.writable
  return <div className="cp:mt-5 cp:border-0 cp:border-t cp:border-solid cp:border-border">
    <SettingRow title="侧边栏账号" description="切换左下角显示的账号。选择 ChatGPT 后，DeepSeek 的账号菜单与提醒会隐藏，可随时切回。" error={error?.key === 'sidebarAccount' ? error.message : undefined}>
      <SettingSelect label="侧边栏账号" value={snapshot.value?.sidebarAccount ?? 'deepseek'} options={[["deepseek", "DeepSeek"], ["chatgpt", "ChatGPT"]]} disabled={disabled} onChange={value => void save('sidebarAccount', value)} />
    </SettingRow>
    <SettingRow title="由 ChatGPT 审批" description="使用 ChatGPT 审批需要你确认的操作，适用于所有模型，并消耗当前 ChatGPT 账号用量。关闭后由你确认。选择官方 Auto 时，由会话模型审查，不额外调用 ChatGPT 审查模型。" error={error?.key === 'codexReview' ? error.message : undefined}>
      <Switch aria-label="由 ChatGPT 审批" checked={snapshot.value?.codexReview === true} disabled={disabled} onCheckedChange={value => void save('codexReview', value)} />
    </SettingRow>
    <SettingRow title="网页搜索" description="选择使用 ChatGPT 网页搜索的模型范围。搜索消耗当前 ChatGPT 账号用量，关闭后使用 DSH 原有搜索。" error={error?.key === 'searchMode' ? error.message : undefined}>
      <SettingSelect label="网页搜索" value={snapshot.value?.searchMode ?? 'off'} options={[["off", "关闭"], ["chatgpt", "仅 ChatGPT"], ["all", "所有模型"]]} disabled={disabled} onChange={value => void save('searchMode', value)} />
    </SettingRow>
  </div>
}
