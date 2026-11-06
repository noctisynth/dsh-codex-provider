import { useState, useSyncExternalStore } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { ConfigForm, SettingsLauncherOwnerProps } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { SidebarPreference } from "../shared/sidebar-preference.ts";
import { AccountAvatar } from "./account-avatar.tsx";
import { OpenAiLogo } from "./openai-logo.tsx";
import { Button } from "./ui/button.tsx";
import { useAccountSettings } from "./use-account-settings.ts";

export function SidebarAccountPreference({ form }: { form: ConfigForm<SidebarPreference> }) {
  const snapshot = useSyncExternalStore(listener => form.subscribe(listener), () => form.getSnapshot());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function select(value: SidebarPreference["sidebarAccount"]) {
    setSaving(true);
    setError("");
    try {
      if (!await form.set("sidebarAccount", value)) setError("未能保存侧边栏显示设置，请重试。");
    } catch {
      setError("未能保存侧边栏显示设置，请重试。");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="cp:mt-5 cp:border-0 cp:border-t cp:border-solid cp:border-border cp:pt-4">
      <div className="cp:flex cp:flex-wrap cp:items-center cp:justify-between cp:gap-3">
        <div className="cp:font-medium">侧边栏账号</div>
        <div role="group" aria-label="侧边栏账号" className="cp:flex cp:gap-1">
          {([['deepseek', 'DeepSeek'], ['chatgpt', 'ChatGPT']] as const).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={snapshot.value?.sidebarAccount === value ? "outline" : "ghost"}
              aria-pressed={snapshot.value?.sidebarAccount === value}
              disabled={saving || snapshot.status !== "ready" || !snapshot.writable}
              onClick={() => select(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <p className="cp:mt-2 cp:mb-0 cp:text-xs cp:text-muted-foreground">
        ChatGPT 模式下隐藏 DeepSeek 账号菜单及提醒，可随时切回。
      </p>
      {error && <p role="alert" className="cp:mt-2 cp:mb-0 cp:text-xs cp:text-destructive">{error}</p>}
    </div>
  );
}

export function ChatGptLauncher({ rpc, wide, openSettings, settingsShortcut }: SettingsLauncherOwnerProps & { rpc: ClientConnectionRpc }) {
  const { status } = useAccountSettings(rpc);
  const account = status?.accounts.find(account => account.clientId === status.active && account.hasCredentials);
  const label = account?.name || account?.email || "ChatGPT";
  return (
    <Button
      variant="ghost"
      aria-label={`${label}，打开设置`}
      aria-keyshortcuts={settingsShortcut?.aria}
      title={wide ? undefined : `${label} · 设置`}
      onClick={openSettings}
      className={`cp:box-border cp:min-w-0 cp:rounded-[var(--dsw-radius-md)] cp:text-foreground ${wide ? "cp:mx-0.5 cp:h-11 cp:w-[calc(100%-4px)] cp:justify-start cp:gap-2 cp:p-1.5 cp:has-[>svg]:px-1.5" : "cp:mx-auto cp:size-9 cp:justify-center cp:gap-0 cp:p-0 cp:has-[>svg]:px-0"}`}
    >
      {account ? (
        <AccountAvatar name={account.name} email={account.email} picture={account.picture} gravatarPicture={account.gravatarPicture} className="cp:size-6 cp:text-xs" />
      ) : <OpenAiLogo size={24} className="cp:size-6" />}
      {wide && (
        <>
          <span className="cp:min-w-0 cp:flex-1 cp:text-left">
            <span className="cp:block cp:truncate cp:text-sm cp:leading-5 cp:font-medium">{label}</span>
            <span className="cp:block cp:truncate cp:text-xs cp:leading-4 cp:font-normal cp:text-muted-foreground">
              {account ? "ChatGPT" : status ? "前往设置登录" : "正在读取账号"}
            </span>
          </span>
        </>
      )}
    </Button>
  );
}

export function mountSidebarAccount(ctx: Context, rpc: ClientConnectionRpc, form: ConfigForm<SidebarPreference>) {
  ctx.slots.inject("settings.launcher", () => {
    let dispose: (() => void) | undefined;
    const sync = () => {
      if (form.getSnapshot().value?.sidebarAccount === "chatgpt") {
        dispose ??= ctx.slots.register(
          { name: "settings.launcher", priority: -1, inject: () => ({ rpc }) },
          ChatGptLauncher,
        );
      } else {
        dispose?.();
        dispose = undefined;
      }
    };
    const unsubscribe = form.subscribe(sync);
    sync();
    return () => { unsubscribe(); dispose?.(); };
  });
}
