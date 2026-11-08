import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { type ReactNode, useRef, useState, useSyncExternalStore } from 'react'
import type { Capabilities } from '../index.cjs'
import type { PreferenceKey } from '../shared/features.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { setPreference } from './preferences.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx'
import { Switch } from './ui/switch.tsx'

function SettingRow({
  title,
  description,
  error,
  children,
}: {
  title: string
  description: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className='cp:flex cp:items-center cp:justify-between cp:gap-6 cp:border-0 cp:border-b cp:border-solid cp:border-border cp:py-4 cp:last:border-b-0'>
      <div className='cp:min-w-0'>
        <div className='cp:text-sm cp:leading-5'>{title}</div>
        <p className='cp:mt-1 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-muted-foreground'>
          {description}
        </p>
        {error && (
          <p
            role='alert'
            className='cp:mt-2 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-destructive'
          >
            {error}
          </p>
        )}
      </div>
      {children}
    </div>
  )
}

function SettingSelect({
  label,
  value,
  options,
  disabled,
  onChange,
  disabledValues = [],
}: {
  label: string
  value: string
  options: readonly (readonly [string, string])[]
  disabled: boolean
  onChange(value: string): void
  disabledValues?: readonly string[]
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <Select
      value={value}
      items={options.map(([value, label]) => ({ value, label }))}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
      onOpenChange={(open, details) => {
        if (details.reason === 'escape-key') details.event.stopPropagation()
        if (open)
          setContainer(triggerRef.current?.closest<HTMLElement>('[role="dialog"], dialog') ?? null)
      }}
    >
      <SelectTrigger aria-label={label} ref={triggerRef}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map(([id, name]) => (
          <SelectItem key={id} value={id} disabled={disabledValues.includes(id)}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function FeatureSettings({
  form,
  rpc,
  t,
  capabilities,
}: {
  form: ConfigForm<SidebarPreference>
  rpc: ClientConnectionRpc
  t: Translate
  capabilities?: Capabilities
}) {
  const snapshot = useSyncExternalStore(
    (listener) => form.subscribe(listener),
    () => form.getSnapshot(),
  )
  const [saving, setSaving] = useState<PreferenceKey>()
  const [error, setError] = useState<{ key: PreferenceKey; message: string }>()
  async function save(key: PreferenceKey, value: string | boolean) {
    setSaving(key)
    setError(undefined)
    try {
      await setPreference(rpc, key, value)
    } catch (cause) {
      setError({
        key,
        message:
          cause instanceof Error ? cause.message : 'Could not save settings. Please try again.',
      })
    } finally {
      setSaving(undefined)
    }
  }
  const disabled = !!saving || snapshot.status !== 'ready' || !snapshot.writable
  const canSearch = capabilities?.webSearch !== false
  return (
    <div className='cp:mt-5 cp:border-0 cp:border-t cp:border-solid cp:border-border'>
      <SettingRow
        title={t('Sidebar account')}
        description={t(
          'Choose the account shown in the lower-left corner. Choosing ChatGPT hides the DeepSeek account menu and reminders. You can switch back at any time.',
        )}
        error={error?.key === 'sidebarAccount' ? t(error.message) : undefined}
      >
        <SettingSelect
          label={t('Sidebar account')}
          value={snapshot.value?.sidebarAccount ?? 'deepseek'}
          options={[
            ['deepseek', 'DeepSeek'],
            ['chatgpt', 'ChatGPT'],
          ]}
          disabled={disabled}
          onChange={(value) => void save('sidebarAccount', value)}
        />
      </SettingRow>
      <SettingRow
        title={t('Usage refresh')}
        description={t(
          'Usage is shown only for legacy sign-ins, in account settings and the ChatGPT sidebar. Choose how often it refreshes automatically, or refresh it manually from the account menu.',
        )}
        error={error?.key === 'quotaRefresh' ? t(error.message) : undefined}
      >
        <SettingSelect
          label={t('Usage refresh')}
          value={snapshot.value?.quotaRefresh ?? '5'}
          options={[
            ['0', t('Off')],
            ['1', t('Every minute')],
            ['5', t('Every 5 minutes')],
            ['15', t('Every 15 minutes')],
          ]}
          disabled={disabled}
          onChange={(value) => void save('quotaRefresh', value)}
        />
      </SettingRow>
      <SettingRow
        title={t('Review with ChatGPT')}
        description={t(
          'Use ChatGPT to review operations that need your confirmation, for all models. Reviews use your current ChatGPT account allowance. Turn this off to confirm operations yourself. With official Auto selected, reviews use the conversation model without an additional ChatGPT reviewer call.',
        )}
        error={error?.key === 'codexReview' ? t(error.message) : undefined}
      >
        <Switch
          aria-label={t('Review with ChatGPT')}
          checked={snapshot.value?.codexReview === true}
          disabled={disabled}
          onCheckedChange={(value) => void save('codexReview', value)}
        />
      </SettingRow>
      <SettingRow
        title={t('Web search')}
        description={t(
          canSearch
            ? "Choose which models use ChatGPT web search. Searches use your current ChatGPT account allowance. Turn this off to use DSH's original search."
            : 'Built-in web search is not available with this sign-in method. Choose an SIWC account to use it.',
        )}
        error={error?.key === 'searchMode' ? t(error.message) : undefined}
      >
        <SettingSelect
          label={t('Web search')}
          value={snapshot.value?.searchMode ?? 'off'}
          options={[
            ['off', t('Off')],
            ['chatgpt', t('ChatGPT only')],
            ['all', t('All models')],
          ]}
          disabled={disabled}
          onChange={(value) => void save('searchMode', value)}
          disabledValues={canSearch ? [] : ['chatgpt', 'all']}
        />
      </SettingRow>
      <SettingRow
        title={t('Image detail')}
        description={t(
          'Choose the detail used to read attached images. Available levels depend on the model.',
        )}
        error={error?.key === 'imageDetail' ? t(error.message) : undefined}
      >
        <SettingSelect
          label={t('Image detail')}
          value={snapshot.value?.imageDetail ?? 'auto'}
          options={[
            ['auto', t('Automatic')],
            ['low', t('Low')],
            ['high', t('High')],
            ['original', t('Original')],
          ]}
          disabled={disabled}
          onChange={(value) => void save('imageDetail', value)}
        />
      </SettingRow>
    </div>
  )
}
