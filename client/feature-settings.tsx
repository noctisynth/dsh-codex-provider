import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { type ReactNode, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Capabilities } from '../index.cjs'
import type { PreferenceKey } from '../shared/features.ts'
import type { SidebarPreference } from '../shared/sidebar-preference.ts'
import { cn } from './lib/utils.ts'
import { PreferenceError, setPreference } from './preferences.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx'
import { Switch } from './ui/switch.tsx'

function SettingRow({
  title,
  description,
  error,
  inputId,
  children,
}: {
  title: string
  description: string
  error?: string
  inputId?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'cp:flex cp:items-center cp:justify-between cp:gap-6 cp:border-0 cp:border-b cp:border-solid cp:border-border cp:py-4 cp:last:border-b-0',
        inputId && 'cp:flex-wrap cp:gap-x-6 cp:gap-y-2',
      )}
    >
      <div className={cn('cp:min-w-0', inputId && 'cp:flex-1 cp:basis-52')}>
        {inputId ? (
          <label htmlFor={inputId} className='cp:text-sm cp:leading-5'>
            {title}
          </label>
        ) : (
          <div className='cp:text-sm cp:leading-5'>{title}</div>
        )}
        <p
          id={inputId && `${inputId}-hint`}
          className='cp:mt-1 cp:mb-0 cp:text-xs cp:leading-[18px] cp:text-muted-foreground'
        >
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
  const [error, setError] = useState<{ key: PreferenceKey; message: string; code?: string }>()
  const [proxyDraft, setProxyDraft] = useState<string>()
  const [proxyCommit, setProxyCommit] = useState<{ previous: string; value: string }>()
  const [proxyNotice, setProxyNotice] = useState<string>()
  const savingProxy = useRef(false)
  const proxyId = useId()
  async function save(key: PreferenceKey, value: string | boolean): Promise<boolean> {
    setSaving(key)
    setError(undefined)
    try {
      await setPreference(rpc, key, value)
      return true
    } catch (cause) {
      setError({
        key,
        code: cause instanceof PreferenceError ? cause.code : undefined,
        message:
          cause instanceof Error ? cause.message : 'Could not save settings. Please try again.',
      })
      return false
    } finally {
      setSaving(undefined)
    }
  }
  const writable = snapshot.status === 'ready' && snapshot.writable
  const disabled = !!saving || !writable
  const canSearch = capabilities?.webSearch !== false
  const modelProxy = snapshot.value?.modelProxy ?? ''
  // The settings document notification may arrive after the save RPC has returned.
  const currentProxy = proxyCommit?.previous === modelProxy ? proxyCommit.value : modelProxy
  useEffect(() => {
    if (proxyCommit && proxyCommit.previous !== modelProxy) setProxyCommit(undefined)
  }, [modelProxy, proxyCommit])
  const nextProxy = proxyDraft?.trim()
  const canSaveProxy = !disabled && nextProxy !== undefined && nextProxy !== currentProxy
  const proxyError = error?.key === 'modelProxy' ? error : undefined
  let proxyStatus = proxyNotice
  if (snapshot.status === 'loading') proxyStatus = 'Loading proxy settings…'
  else if (snapshot.status === 'unavailable') proxyStatus = 'Proxy settings are unavailable.'
  else if (!writable) proxyStatus = 'Proxy settings are read-only.'
  else if (saving === 'modelProxy') proxyStatus = 'Saving…'
  async function saveProxy() {
    if (!canSaveProxy || savingProxy.current) return
    savingProxy.current = true
    setProxyNotice(undefined)
    try {
      if (await save('modelProxy', nextProxy)) {
        setProxyCommit({ previous: modelProxy, value: nextProxy })
        setProxyDraft(undefined)
        setProxyNotice(nextProxy ? 'Proxy settings saved.' : 'Using default network settings.')
      }
    } finally {
      savingProxy.current = false
    }
  }
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
      <SettingRow
        title={t('Model request proxy')}
        description={t(
          'Use an HTTP or HTTPS forward proxy for ChatGPT model requests only. If it fails, requests are not sent directly. Clear the address and save to restore the default network settings.',
        )}
        inputId={proxyId}
      >
        <div className='cp:min-w-0 cp:flex-1 cp:basis-60'>
          <div className='cp:flex cp:items-center cp:gap-2'>
            <Input
              id={proxyId}
              aria-describedby={`${proxyId}-hint${proxyError ? ` ${proxyId}-error` : ''}`}
              aria-invalid={proxyError?.code === 'invalid-model-proxy' || undefined}
              autoComplete='off'
              spellCheck={false}
              inputMode='url'
              placeholder='http://127.0.0.1:7890'
              value={proxyDraft ?? currentProxy}
              disabled={!writable}
              readOnly={!!saving}
              onChange={(event) => {
                setProxyDraft(event.currentTarget.value)
                setProxyNotice(undefined)
                if (proxyError) setError(undefined)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
                event.preventDefault()
                void saveProxy()
              }}
            />
            <Button
              type='button'
              size='sm'
              variant='outline'
              className='cp:aria-disabled:opacity-50'
              disabled={!canSaveProxy}
              focusableWhenDisabled
              onClick={saveProxy}
            >
              {t('Save')}
            </Button>
          </div>
          {proxyError && (
            <p
              id={`${proxyId}-error`}
              role='alert'
              className='cp:mt-1 cp:mb-0 cp:text-xs cp:text-destructive'
            >
              {t(proxyError.message)}
            </p>
          )}
          <div role='status' className='cp:text-xs cp:text-muted-foreground'>
            {proxyStatus && <p className='cp:mt-1 cp:mb-0'>{t(proxyStatus)}</p>}
          </div>
        </div>
      </SettingRow>
    </div>
  )
}
