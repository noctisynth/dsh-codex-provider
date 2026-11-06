import { useEffect, useRef, useState } from "react";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { AccountActions, AccountStatus } from "../shared/account-ui.ts";

const accountStatusChanged = "codex-provider:accounts-changed";

export function useAccountSettings(rpc: ClientConnectionRpc) {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const ownedLogin = useRef(false);
  const call = async <A extends keyof AccountActions>(
    action: A,
    payload: { id: string } | null = null,
    signal?: AbortSignal,
  ): Promise<AccountActions[A]> => {
    const result = await rpc.call("/api", `codex-provider/${action}`, payload, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value as AccountActions[A];
  };
  useEffect(() => {
    const lifetime = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const value = await call("status", null, lifetime.signal);
        if (lifetime.signal.aborted) return;
        setStatus(value);
        const completed = ownedLogin.current && !value.login.running;
        if (!value.login.running) ownedLogin.current = false;
        if (completed) window.dispatchEvent(new Event(accountStatusChanged));
        if (value.login.running) timer = setTimeout(load, 700);
      } catch (error) {
        if (!lifetime.signal.aborted)
          setError(error instanceof Error ? error.message : "无法读取账号状态。");
      }
    };
    void load();
    return () => {
      lifetime.abort();
      clearTimeout(timer);
    };
  }, [rpc, revision]);
  useEffect(() => {
    const resume = () => {
      setNotice("");
      setError("");
      refresh((value) => value + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") resume();
    };
    const changed = () => refresh((value) => value + 1);
    window.addEventListener("focus", resume);
    window.addEventListener(accountStatusChanged, changed);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", resume);
      window.removeEventListener(accountStatusChanged, changed);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(
    () => () => {
      if (ownedLogin.current) void call("cancel").catch(() => {});
    },
    [rpc],
  );
  async function act(
    action: Exclude<keyof AccountActions, "status">,
    payload?: { id: string },
  ): Promise<void> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await call(action, payload);
      if (action === "login") ownedLogin.current = true;
      if (action === "logout") {
        if ((value as AccountActions["logout"]).revocationConfirmed) setNotice("已退出登录");
        else setError("本地凭据已清除，未能确认远端授权撤销。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "操作失败，请重试。");
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event(accountStatusChanged));
    }
  }
  return { status, busy, notice, error, act };
}
