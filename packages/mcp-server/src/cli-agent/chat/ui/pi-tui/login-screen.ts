import {
  Container,
  Key,
  matchesKey,
  ProcessTerminal,
  SelectList,
  type SelectItem,
  Text,
  TUI,
} from "@earendil-works/pi-tui";
import cfonts from "cfonts";
import type { McpServerConfig } from "../../../../config.js";
import { runLoginFlow } from "../../../../lib/mcp-auth.js";

function buildBannerLines(): string[] {
  try {
    const result = cfonts.render("CODEMAP", {
      font: "simple3d",
      gradient: ["cyan", "magenta"],
      env: "node",
    });
    const raw: string = (result as { string: string }).string ?? "";
    const lines = raw.split("\n");
    let s = 0, e = lines.length - 1;
    while (s <= e && (lines[s] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") s++;
    while (e >= s && (lines[e] ?? "").replace(/\x1b\[[0-9;]*m/g, "").trim() === "") e--;
    return lines.slice(s, e + 1);
  } catch {
    return ["  CODEMAP"];
  }
}

const ITEMS: SelectItem[] = [
  {
    value: "login",
    label: "Login to CodeMap",
    description: "Opens browser — required for cloud features (graph, insights, team sharing)",
  },
  {
    value: "continue",
    label: "Continue without login",
    description: "Local tools only — search, edit, bash work without a cloud account",
  },
  {
    value: "exit",
    label: "Exit",
    description: "",
  },
];

const SELECT_THEME = {
  selectedPrefix: (t: string) => `\x1b[36m❯ ${t}\x1b[0m`,
  selectedText:   (t: string) => `\x1b[1;37m${t}\x1b[0m`,
  description:    (t: string) => `  \x1b[2m${t}\x1b[0m`,
  scrollInfo:     (t: string) => `\x1b[2m${t}\x1b[0m`,
  noMatch:        (t: string) => `\x1b[2m${t}\x1b[0m`,
};

/** Shows the login screen and returns true if the user is now authenticated (login success or skip). */
export async function showLoginScreen(config: McpServerConfig): Promise<"loggedin" | "skip" | "exit"> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal, false);
    const root = new Container();

    const bannerLines = buildBannerLines();
    const banner = new Text(bannerLines.join("\n"));

    const subtitle = new Text(
      "\x1b[2m  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM\x1b[0m\n",
    );

    const heading = new Text("\x1b[1;37m  Welcome — you are not logged in.\x1b[0m\n");

    const select = new SelectList(ITEMS, ITEMS.length, SELECT_THEME);

    select.onSelect = async (item) => {
      if (item.value === "exit") {
        tui.stop();
        resolve("exit");
        return;
      }

      if (item.value === "continue") {
        tui.stop();
        resolve("skip");
        return;
      }

      // Login selected — show status and run auth flow
      root.removeChild(select);
      const status = new Text("\x1b[36m  Opening browser for CodeMap login...\x1b[0m");
      root.addChild(status);
      tui.requestRender();

      try {
        const result = await runLoginFlow(config);
        tui.stop();
        const name = result.user?.name ?? result.user?.email ?? "user";
        process.stdout.write(`\n\x1b[32m  ✓ Logged in as ${name}\x1b[0m\n\n`);
        resolve("loggedin");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        root.removeChild(status);
        root.addChild(new Text(`\x1b[31m  Login failed: ${msg}\x1b[0m\n`));
        root.addChild(new Text("\x1b[2m  Press any key to continue without login...\x1b[0m"));
        tui.requestRender();

        tui.addInputListener(() => {
          tui.stop();
          resolve("skip");
          return { consume: true };
        });
      }
    };

    select.onCancel = () => {
      tui.stop();
      resolve("exit");
    };

    root.addChild(banner);
    root.addChild(subtitle);
    root.addChild(heading);
    root.addChild(select);
    tui.addChild(root);
    tui.setFocus(select);

    tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        tui.stop();
        resolve("exit");
        return { consume: true };
      }
      select.handleInput(data);
      tui.requestRender();
      return { consume: true };
    });

    tui.start();
  });
}
