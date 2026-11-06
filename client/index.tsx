import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import { AccountSettings } from "./account-settings.tsx";
import { OpenAiLogo } from "./openai-logo.tsx";
import { mountSidebarAccount } from "./sidebar-account.tsx";
import type { SidebarPreference } from "../shared/sidebar-preference.ts";
import styles from "./styles.generated.css?inline";

export const inject = ["slots", "connection", "configForms"];

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-codex-provider";
    style.textContent = styles;
    document.head.append(style);
    return () => style.remove();
  });
  const rpc = (ctx.get("connection") as ConnectionHandle).rpc;
  const preference = ctx.configForms.get<SidebarPreference>("codex-provider");
  mountSidebarAccount(ctx, rpc, preference);
  ctx.slots.inject("settings.section.icon", () =>
    ctx.slots.register({ name: "settings.section.icon", id: "codex-provider" }, OpenAiLogo),
  );
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "codex-provider",
        order: 15,
        label: () => "ChatGPT",
        inject: () => ({ rpc, preference, embedded: false }),
      },
      AccountSettings,
    ),
  );
  ctx.slots.inject("plugins.bundle.config", () =>
    ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-codex-provider",
        inject: () => ({ rpc, preference, embedded: true }),
      },
      AccountSettings,
    ),
  );
}
