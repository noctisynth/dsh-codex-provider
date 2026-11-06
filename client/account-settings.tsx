import { useRef, useState, useId, useEffect } from "react";
import { ArrowRight, Check, LoaderCircle, Plus, UserRound } from "lucide-react";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { AccountStatus } from "../shared/account-ui.ts";
import { useAccountSettings } from "./use-account-settings.ts";
import { Button } from "./ui/button.tsx";
import { Skeleton } from "./ui/skeleton.tsx";

type Account = AccountStatus["accounts"][number];

function LogoutConfirmation({
  account,
  close,
  confirm,
}: {
  account: Account;
  close(): void;
  confirm(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const description = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={title}
      aria-describedby={description}
      onClose={close}
      className="cp:box-border cp:w-[calc(100%-2rem)] cp:max-w-sm cp:rounded-2xl cp:border cp:border-solid cp:border-border cp:bg-background cp:p-6 cp:text-foreground cp:shadow-xl cp:backdrop:bg-black/60"
    >
      <h3 id={title} className="cp:m-0 cp:text-base cp:font-semibold">
        退出这个账号？
      </h3>
      <p
        id={description}
        className="cp:mt-3 cp:mb-6 cp:break-words cp:text-sm cp:leading-relaxed cp:text-muted-foreground"
      >
        退出 {account.email ?? "ChatGPT"} 后，使用此账号的模型请求将停止。你可以随时重新登录。
      </p>
      <div className="cp:flex cp:justify-end cp:gap-2">
        <Button autoFocus size="sm" variant="outline" onClick={close}>
          取消
        </Button>
        <Button size="sm" variant="destructive" onClick={confirm}>
          确认退出
        </Button>
      </div>
    </dialog>
  );
}

export function AccountSettings({
  rpc,
  embedded,
}: {
  rpc: ClientConnectionRpc;
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
        <div>
          <h2 className="cp:m-0 cp:text-lg cp:font-semibold cp:tracking-tight">ChatGPT</h2>
          <p className="cp:mt-1 cp:mb-0 cp:text-sm cp:text-muted-foreground">
            管理用于 Codex 模型的账号。
          </p>
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
              <div className="cp:flex cp:size-9 cp:shrink-0 cp:items-center cp:justify-center cp:rounded-full cp:bg-muted cp:text-muted-foreground">
                <UserRound aria-hidden="true" className="cp:size-4" />
              </div>
              <div className="cp:min-w-0 cp:flex-1">
                <div className="cp:break-all cp:font-medium">{account.email ?? "ChatGPT 账号"}</div>
                <div className="cp:mt-1 cp:flex cp:items-center cp:gap-1.5 cp:text-xs cp:text-muted-foreground">
                  {account.hasCredentials && account.planUsageAuthorized && (
                    <Check aria-hidden="true" className="cp:size-3" />
                  )}
                  {!account.hasCredentials
                    ? "已退出 · 重新登录后可用"
                    : !account.planUsageAuthorized
                      ? "未授权模型使用权限"
                      : status?.active === account.clientId
                        ? "当前使用"
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
        <div className="cp:mt-5 cp:rounded-xl cp:bg-muted/50 cp:p-4">
          <div role="status" className="cp:flex cp:items-start cp:gap-3">
            <LoaderCircle
              aria-hidden="true"
              className="cp:mt-1 cp:size-4 cp:shrink-0 cp:animate-spin cp:motion-reduce:animate-none"
            />
            <div>
              <div className="cp:font-medium">
                {status?.login.prompt ? "选择登录账号" : "等待浏览器授权"}
              </div>
              <p className="cp:mt-1 cp:mb-0 cp:text-xs cp:text-muted-foreground">
                {status?.login.prompt
                  ? "选择已有账号，或添加一个新账号。"
                  : "完成授权后，这里会自动更新。"}
              </p>
            </div>
          </div>
          {status?.login.prompt && (
            <div className="cp:mt-4 cp:space-y-2">
              {status.login.prompt.options.map((option) => (
                <Button
                  key={option.id}
                  size="sm"
                  variant="outline"
                  className="cp:h-auto cp:w-full cp:justify-between cp:py-2 cp:text-left cp:whitespace-normal"
                  disabled={busy}
                  onClick={() => act("answer", { id: option.id })}
                >
                  {option.label}
                  <ArrowRight aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
          <Button
            size="xs"
            variant="ghost"
            className="cp:mt-3"
            disabled={busy}
            onClick={() => act("cancel")}
          >
            取消登录
          </Button>
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
