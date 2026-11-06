import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import type { PreferenceKey } from '../shared/features.ts'
import { setPreference } from './preferences.ts'
import { Button } from './ui/button.tsx'
import { Switch } from './ui/switch.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx'

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
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button size="sm" variant="ghost" aria-label={label} disabled={disabled} className="cp:shrink-0 cp:gap-2 cp:font-normal">
        {options.find(option => option[0] === value)?.[1]}<ChevronDown className="cp:size-3.5 cp:text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="bottom" align="end" className="cp:min-w-40">
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map(([id, name]) => <DropdownMenuRadioItem key={id} value={id}>{name}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
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
    <SettingRow title="侧边栏账号" description="选择左下角显示的账号。ChatGPT 模式下隐藏 DeepSeek 账号菜单及提醒，可随时切回。" error={error?.key === 'sidebarAccount' ? error.message : undefined}>
      <SettingSelect label="侧边栏账号" value={snapshot.value?.sidebarAccount ?? 'deepseek'} options={[["deepseek", "DeepSeek"], ["chatgpt", "ChatGPT"]]} disabled={disabled} onChange={value => void save('sidebarAccount', value)} />
    </SettingRow>
    <SettingRow title="由 ChatGPT 审批" description="保留沙箱，仅审批需要授权的操作。上下文发送至当前 ChatGPT 账号并消耗其用量；关闭后恢复人工审批。" error={error?.key === 'codexReview' ? error.message : undefined}>
      <Switch aria-label="由 ChatGPT 审批" checked={snapshot.value?.codexReview === true} disabled={disabled} onCheckedChange={value => void save('codexReview', value)} />
    </SettingRow>
    <SettingRow title="网页搜索" description="使用 ChatGPT 官方搜索。所有模型模式会切换共享搜索源，并额外使用 ChatGPT 用量；切回后恢复原来源。" error={error?.key === 'searchMode' ? error.message : undefined}>
      <SettingSelect label="网页搜索" value={snapshot.value?.searchMode ?? 'off'} options={[["off", "关闭"], ["chatgpt", "仅 ChatGPT"], ["all", "所有模型"]]} disabled={disabled} onChange={value => void save('searchMode', value)} />
    </SettingRow>
  </div>
}
