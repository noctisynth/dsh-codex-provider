import { useState } from "react";
import { ArrowRight, Check, LoaderCircle, Plus } from "lucide-react";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { AccountStatus } from "../shared/account-ui.ts";
import type { ConfigForm } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { SidebarPreference } from "../shared/sidebar-preference.ts";
import { useAccountSettings } from "./use-account-settings.ts";
import { Button } from "./ui/button.tsx";
import { Skeleton } from "./ui/skeleton.tsx";
import { OpenAiLogo } from "./openai-logo.tsx";
import { AccountAvatar } from "./account-avatar.tsx";
import { SidebarAccountPreference } from "./sidebar-account.tsx";
import { LogoutConfirmation } from "./logout-confirmation.tsx";

type Account = AccountStatus["accounts"][number];

export function AccountSettings({
  rpc,
  preference,
  embedded,
}: {
  rpc: ClientConnectionRpc;
  preference: ConfigForm<SidebarPreference>;
  embedded: boolean;
}) {
  const { status, busy, notice, error, act } = useAccountSettings(rpc);
  const [logout, setLogout] = useState<Account | null>(null);
  const running = status?.login.running === true;
  const accounts = status?.accounts ?? [];
  const failure = error || status?.login.error;
  return (
    <section
      data-codex-provider=""
      aria-label="ChatGPT 账号设置"
      aria-busy={!status || busy}
      className={`cp:box-border cp:[&_*]:box-border cp:w-full cp:max-w-3xl cp:text-sm cp:leading-relaxed cp:text-foreground cp:[&_button]:font-[inherit] ${embedded ? "cp:py-2" : "cp:py-4"}`}
    >
      <header className="cp:mb-7 cp:flex cp:flex-wrap cp:items-start cp:justify-between cp:gap-3">
        <div className="cp:flex cp:items-center cp:gap-3">
          <div className="cp:flex cp:shrink-0 cp:items-center cp:justify-center cp:rounded-xl cp:bg-muted">
            <OpenAiLogo size={48} />
          </div>
          <div>
            <h2 className="cp:m-0 cp:text-lg cp:font-semibold cp:tracking-tight">ChatGPT</h2>
            <p className="cp:mt-1 cp:mb-0 cp:text-sm cp:text-muted-foreground">
              管理用于 Codex 模型的账号。
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || running || !status}
          onClick={() => act("login")}
        >
          <Plus aria-hidden="true" />
          添加账号
        </Button>
      </header>
      {!status && (
        <div className="cp:space-y-3 cp:py-5" aria-label="正在读取账号">
          <Skeleton className="cp:h-4 cp:w-40" />
          <Skeleton className="cp:h-3 cp:w-56 cp:max-w-full" />
        </div>
      )}
      {status && accounts.length === 0 && !running && (
        <div className="cp:rounded-xl cp:bg-muted/50 cp:px-6 cp:py-8">
          <h3 className="cp:m-0 cp:text-base cp:font-medium">连接你的 ChatGPT 账号</h3>
          <p className="cp:mt-2 cp:mb-5 cp:text-muted-foreground">
            在浏览器中完成授权，即可在对话中使用 Codex。
          </p>
          <Button
            size="sm"
            aria-label="使用 ChatGPT 登录"
            disabled={busy}
            onClick={() => act("login")}
          >
            使用 ChatGPT 登录
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}
      {!!accounts.length && (
        <div className="cp:border-y cp:border-solid cp:border-x-0 cp:border-border">
          {accounts.map((account) => (
            <div
              key={account.clientId}
              className="cp:flex cp:flex-wrap cp:items-center cp:gap-3 cp:border-0 cp:border-b cp:border-solid cp:border-border cp:py-5 cp:last:border-b-0"
            >
              <AccountAvatar
                name={account.name}
                email={account.email}
                picture={account.picture}
                gravatarPicture={account.gravatarPicture}
              />
              <div className="cp:min-w-0 cp:flex-1 cp:basis-40">
                <div className="cp:flex cp:items-center cp:gap-2">
                  <span className="cp:break-all cp:font-medium">
                    {account.name || account.email || "ChatGPT 账号"}
                  </span>
                  {account.hasCredentials &&
                    account.planUsageAuthorized &&
                    status?.active === account.clientId && (
                      <Check
                        aria-label="当前使用"
                        className="cp:size-3 cp:shrink-0 cp:text-muted-foreground"
                      />
                    )}
                </div>
                <div className="cp:mt-1 cp:flex cp:items-center cp:gap-1.5 cp:text-xs cp:text-muted-foreground">
                  {!account.hasCredentials
                    ? "已退出 · 重新登录后可用"
                    : !account.planUsageAuthorized
                      ? "未授权模型使用权限"
                      : account.name && account.email
                        ? account.email
                        : "已连接"}
                </div>
              </div>
              <div className="cp:flex cp:items-center cp:gap-2">
                {!account.hasCredentials ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || running}
                    onClick={() => act("login")}
                  >
                    重新登录
                  </Button>
                ) : (
                  <>
                    {status?.active !== account.clientId && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || running}
                        onClick={() => act("select", { id: account.clientId })}
                      >
                        切换账号
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="cp:text-destructive cp:hover:bg-destructive/10 cp:hover:text-destructive"
                      disabled={busy || running}
                      onClick={() => setLogout(account)}
                    >
                      退出登录
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {running && (
        <div className="cp:mt-5 cp:rounded-xl cp:border cp:border-solid cp:border-border cp:bg-muted/30 cp:p-4">
          <div role="status" className="cp:flex cp:items-start cp:gap-3">
            {!status?.login.prompt && (
              <LoaderCircle
                aria-hidden="true"
                className="cp:mt-1 cp:size-4 cp:shrink-0 cp:animate-spin cp:motion-reduce:animate-none"
              />
            )}
            <div>
              <div className="cp:font-medium">
                {status?.login.prompt
                  ? status.login.prompt.options.some((option) => option.id === "add")
                    ? "选择登录方式"
                    : status.login.prompt.message
                  : "等待浏览器授权"}
              </div>
              <p className="cp:mt-1 cp:mb-0 cp:text-xs cp:text-muted-foreground">
                {status?.login.prompt
                  ? "重新授权已有账号，或连接其他账号。"
                  : "完成授权后，这里会自动更新。"}
              </p>
            </div>
          </div>
          {status?.login.prompt && (
            <div className="cp:mt-3 cp:space-y-1">
              {status.login.prompt.options.map((option) => {
                const account = accounts.find((account) => account.clientId === option.id);
                const label = account
                  ? `重新登录 ${account.name || account.email || "此账号"}`
                  : option.id === "add"
                    ? "添加新账号"
                    : option.label;
                return (
                  <Button
                    key={option.id}
                    size="sm"
                    variant="ghost"
                    className="cp:group cp:h-auto cp:w-full cp:justify-between cp:gap-4 cp:px-3 cp:has-[>svg]:pr-5 cp:py-3 cp:text-left cp:whitespace-normal"
                    disabled={busy}
                    onClick={() => act("answer", { id: option.id })}
                  >
                    <span className="cp:min-w-0 cp:break-words">{label}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="cp:transition-transform cp:duration-150 cp:group-hover:translate-x-1 cp:group-focus-visible:translate-x-1 cp:motion-reduce:transition-none cp:motion-reduce:transform-none"
                    />
                  </Button>
                );
              })}
            </div>
          )}
          <div className="cp:mt-3 cp:flex cp:justify-end cp:border-0 cp:border-t cp:border-solid cp:border-border cp:pt-3">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => act("cancel")}
            >
              取消登录
            </Button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="cp:mt-3 cp:mb-0 cp:text-xs cp:text-muted-foreground">
          {notice}
        </p>
      )}
      {failure && (
        <p role="alert" className="cp:mt-3 cp:mb-0 cp:text-sm cp:text-destructive">
          {failure}
        </p>
      )}
      <p className="cp:mt-5 cp:mb-0 cp:text-xs cp:text-muted-foreground">
        模型与推理强度在对话的模型菜单中切换。
      </p>
      <SidebarAccountPreference form={preference} />
      {logout && (
        <LogoutConfirmation
          account={logout}
          close={() => setLogout(null)}
          confirm={() => {
            setLogout(null);
            void act("logout", { id: logout.clientId });
          }}
        />
      )}
    </section>
  );
}
