import {
  ArrowRight,
  Check,
  CircleAlert,
  LoaderCircle,
  LogOut,
  Plus,
  Terminal,
  UserRound,
} from "lucide-react";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import { useAccountSettings } from "./use-account-settings.ts";
import { Button } from "./ui/button.tsx";
import { Badge } from "./ui/badge.tsx";
import { Card, CardContent } from "./ui/card.tsx";
import { Alert, AlertDescription } from "./ui/alert.tsx";
import { Skeleton } from "./ui/skeleton.tsx";

export function AccountSettings({
  rpc,
  embedded,
}: {
  rpc: ClientConnectionRpc;
  embedded: boolean;
}) {
  const { status, busy, notice, error, act } = useAccountSettings(rpc);
  const running = status?.login.running === true;
  const hasAccounts = !!status?.accounts.length;
  const failure = error || status?.login.error;
  const message = notice || status?.login.notice;
  return (
    <section
      data-codex-provider=""
      aria-label="ChatGPT 账号设置"
      aria-busy={!status || busy}
      className={`cp:box-border cp:[&_*]:box-border cp:w-full cp:max-w-3xl cp:space-y-5 cp:text-sm cp:leading-relaxed cp:text-foreground cp:[&_button]:font-[inherit] ${embedded ? "cp:py-3" : "cp:py-5"}`}
    >
      <header className="cp:flex cp:flex-wrap cp:items-center cp:justify-between cp:gap-4">
        <div className="cp:flex cp:items-center cp:gap-3">
          <div className="cp:flex cp:size-10 cp:shrink-0 cp:items-center cp:justify-center cp:rounded-xl cp:bg-muted">
            <Terminal aria-hidden="true" className="cp:size-5" />
          </div>
          <div>
            <h2 className="cp:m-0 cp:text-lg cp:font-semibold cp:tracking-tight">ChatGPT</h2>
            <p className="cp:m-0 cp:text-sm cp:text-muted-foreground">
              连接官方账号，在 DSH 中使用 Codex。
            </p>
          </div>
        </div>
        {hasAccounts && (
          <Button variant="outline" disabled={busy || running} onClick={() => act("login")}>
            <Plus aria-hidden="true" />
            添加账号
          </Button>
        )}
      </header>
      {!status && (
        <Card aria-label="正在读取账号">
          <CardContent className="cp:space-y-3">
            <Skeleton className="cp:h-4 cp:w-32" />
            <Skeleton className="cp:h-3 cp:w-56 cp:max-w-full" />
          </CardContent>
        </Card>
      )}
      {status && !hasAccounts && !running && (
        <Card>
          <CardContent className="cp:flex cp:flex-col cp:items-center cp:gap-3 cp:py-4 cp:text-center">
            <UserRound aria-hidden="true" className="cp:size-7 cp:text-muted-foreground" />
            <div>
              <h3 className="cp:m-0 cp:text-base cp:font-medium">连接你的 ChatGPT</h3>
              <p className="cp:mt-1 cp:mb-0 cp:text-muted-foreground">
                在浏览器中安全登录，授权完成后即可选择模型。
              </p>
            </div>
            <Button aria-label="使用 ChatGPT 登录" disabled={busy} onClick={() => act("login")}>
              使用 ChatGPT 登录
              <ArrowRight aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>
      )}
      {hasAccounts && (
        <div className="cp:space-y-3">
          <div className="cp:text-xs cp:font-medium cp:text-muted-foreground">已添加账号</div>
          {status.accounts.map((account) => (
            <Card key={account.clientId} className="cp:gap-0 cp:py-4 cp:shadow-none">
              <CardContent className="cp:space-y-3 cp:px-4">
                <div className="cp:flex cp:flex-wrap cp:items-start cp:justify-between cp:gap-3">
                  <div className="cp:min-w-0 cp:flex-1">
                    <div className="cp:flex cp:flex-wrap cp:items-center cp:gap-2">
                      <span className="cp:break-all cp:font-medium">
                        {account.email ?? "ChatGPT 账号"}
                      </span>
                      {status.active === account.clientId && (
                        <Badge variant="secondary">
                          <Check aria-hidden="true" />
                          当前使用
                        </Badge>
                      )}
                    </div>
                    <p className="cp:mt-1 cp:mb-0 cp:text-xs cp:text-muted-foreground">
                      {!account.hasCredentials
                        ? "已退出登录"
                        : account.planUsageAuthorized
                          ? "已授权订阅用量"
                          : "未授予订阅用量权限"}
                    </p>
                  </div>
                  {account.hasCredentials && (
                    <div className="cp:flex cp:items-center cp:gap-1">
                      {status.active !== account.clientId && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy || running}
                          onClick={() => act("select", { id: account.clientId })}
                        >
                          切换账号
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy || running}
                        onClick={() => act("logout", { id: account.clientId })}
                      >
                        <LogOut aria-hidden="true" />
                        退出登录
                      </Button>
                    </div>
                  )}
                </div>
                <details className="cp:text-xs cp:text-muted-foreground">
                  <summary className="cp:w-fit cp:cursor-pointer">注册信息</summary>
                  <code className="cp:mt-2 cp:block cp:break-all cp:font-mono">
                    {account.clientId}
                  </code>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {running && (
        <Card role="status">
          <CardContent className="cp:space-y-4">
            <div className="cp:flex cp:items-start cp:gap-3">
              <LoaderCircle
                aria-hidden="true"
                className="cp:mt-0.5 cp:size-5 cp:shrink-0 cp:animate-spin cp:motion-reduce:animate-none"
              />
              <div>
                <div className="cp:font-medium">在浏览器中完成授权</div>
                <p className="cp:mt-1 cp:mb-0 cp:text-muted-foreground">
                  完成后会自动连接，你可以回到这里查看结果。
                </p>
              </div>
            </div>
            {status?.login.prompt && (
              <div className="cp:space-y-2">
                <p className="cp:m-0 cp:font-medium">{status.login.prompt.message}</p>
                {status.login.prompt.options.map((option) => (
                  <Button
                    key={option.id}
                    variant="outline"
                    className="cp:h-auto cp:w-full cp:justify-between cp:py-3 cp:text-left cp:whitespace-normal"
                    disabled={busy}
                    onClick={() => act("answer", { id: option.id })}
                  >
                    <span>
                      {option.label}
                      {option.description && (
                        <span className="cp:mt-1 cp:block cp:text-xs cp:font-normal cp:text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </Button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" disabled={busy} onClick={() => act("cancel")}>
              取消登录
            </Button>
          </CardContent>
        </Card>
      )}
      {message && (
        <Alert role="status">
          <Check aria-hidden="true" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      {failure && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <p className="cp:m-0 cp:text-xs cp:text-muted-foreground">
        模型与推理强度可在对话中的模型菜单调整。
      </p>
    </section>
  );
}
