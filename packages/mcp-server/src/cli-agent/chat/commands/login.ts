import { loadConfig } from "../../../config.js";
import { createCodeMapClient } from "../../../lib/codemap-api.js";
import {
  startMcpLogin,
  tryOpenLoginBrowser,
  waitForLoginAuthorization,
} from "../../../lib/mcp-auth.js";
import type { Command } from "./types.js";

export const loginCommand: Command = {
  name: "login",
  description: "Log in to CodeMap (opens browser for authorization)",
  execute: async (_args, ctx) => {
    ctx.setBusy(true);
    try {
      const config = await loadConfig();

      if (config.apiToken) {
        const lines = ["Already logged in."];
        if (config.user?.email) lines.push(`Account: ${config.user.email}`);
        if (config.user?.name) lines.push(`Name:    ${config.user.name}`);
        lines.push(`API:     ${config.apiUrl}`);
        lines.push(`\nUse /logout first if you want to log in with a different account.`);
        ctx.setMessages((prev) => [
          ...prev,
          { role: "system", content: lines.join("\n") },
        ]);
        return;
      }

      ctx.setMessages((prev) => [
        ...prev,
        { role: "system", content: "Starting CodeMap login..." },
      ]);
      const client = createCodeMapClient(config);
      const startResponse = await startMcpLogin(client);
      const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);

      const urlMsg = openedBrowser
        ? "Browser opened for CodeMap authorization.\nWaiting for you to approve access..."
        : `Open this URL to log in:\n${startResponse.authorizeUrl}\n\nWaiting for authorization...`;

      ctx.setMessages((prev) => [...prev, { role: "system", content: urlMsg }]);

      const result = await waitForLoginAuthorization(config, startResponse);

      const lines = ["Logged in successfully."];
      if (result.user?.email) lines.push(`Account: ${result.user.email}`);
      if (result.user?.name) lines.push(`Name:    ${result.user.name}`);
      lines.push(`API:     ${result.apiUrl || config.apiUrl}`);
      ctx.setMessages((prev) => [...prev, { role: "system", content: lines.join("\n") }]);

      await ctx.reinitHarness?.();
    } catch (err) {
      ctx.setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Login failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
    } finally {
      ctx.setBusy(false);
    }
  },
};
