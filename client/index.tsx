import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import { AccountSettings } from "./account-settings.tsx";
import styles from "./styles.generated.css?inline";

export const inject = ["slots", "connection"];

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.plugin = "dsh-codex-provider";
    style.textContent = styles;
    document.head.append(style);
    return () => style.remove();
  });
  const rpc = (ctx.get("connection") as ConnectionHandle).rpc;
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "codex-provider",
        order: 15,
        label: () => "ChatGPT",
        inject: () => ({ rpc, embedded: false }),
      },
      AccountSettings,
    ),
  );
  ctx.slots.inject("plugins.bundle.config", () =>
    ctx.slots.register(
      {
        name: "plugins.bundle.config",
        key: "dsh-codex-provider",
        inject: () => ({ rpc, embedded: true }),
      },
      AccountSettings,
    ),
  );
}
