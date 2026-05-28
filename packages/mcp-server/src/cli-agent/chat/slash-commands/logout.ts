import { loadConfig, clearGlobalAuthConfig } from "../../../config.js";
import { createCodeMapClient } from "../../../lib/codemap-api.js";
import type { Command } from "./types.js";

export const logoutCommand: Command = {
  name: "logout",
  description: "Log out of CodeMap and clear stored credentials",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const config = await loadConfig();
      if (!config.apiToken) {
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: "Not logged in." },
        ]);
        return;
      }
      const client = createCodeMapClient(config);
      await client
        .request("/settings/api-keys/revoke-current", {
          method: "POST",
          authRequired: true,
        })
        .catch(() => {});
      await clearGlobalAuthConfig(config);
      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "Logged out. API key revoked and credentials cleared." },
      ]);
    } catch (err) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Logout error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      ctx.setBusy(false);
    }
  },
};
