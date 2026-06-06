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
import type { McpServerConfig } from "@codemap/core/config.js";
import { runLoginFlow } from "@codemap/core/lib/mcp-auth.js";
import {
  BOLD,
  C_ACTION,
  C_ERROR,
  C_GRAY,
  C_SUCCESS,
  C_WHITE,
  RESET,
  SPINNER,
} from "../theme.js";

function buildBannerLines(): string[] {
  try {
    const result = cfonts.render("CODEMAP", {
      font: "simple3d",
      gradient: ["cyan", "magenta"],
      transitionColors: true,
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
  selectedPrefix: (t: string) => `${C_ACTION}❯ ${t}${RESET}`,
  selectedText:   (t: string) => `${C_WHITE}${BOLD}${t}${RESET}`,
  description:    (t: string) => `  ${C_GRAY}${t}${RESET}`,
  scrollInfo:     (t: string) => `${C_GRAY}${t}${RESET}`,
  noMatch:        (t: string) => `${C_GRAY}${t}${RESET}`,
};

/** Shows the login screen and returns true if the user is now authenticated (login success or skip). */
export async function showLoginScreen(config: McpServerConfig): Promise<"loggedin" | "skip" | "exit"> {
  return new Promise((resolve) => {
    const terminal = new ProcessTerminal();
    const tui = new TUI(terminal, false);
    const root = new Container();
    let loginActive = false;

    const bannerLines = buildBannerLines();
    const banner = new Text(bannerLines.join("\n"));

    const subtitle = new Text(`${C_GRAY}  AI-POWERED CODE INTELLIGENCE & AGENT PLATFORM${RESET}\n`);

    const heading = new Text(`${C_WHITE}${BOLD}  Welcome — you are not logged in.${RESET}\n`);

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
      loginActive = true;
      root.removeChild(select);
      const status = new Text(`${C_ACTION}  Opening browser for CodeMap login...${RESET}`);
      root.addChild(status);
      tui.requestRender();

      // Spinner animation while waiting for browser authorization
      let spinnerFrame = 0;
      const spinnerInterval = setInterval(() => {
        spinnerFrame = (spinnerFrame + 1) % SPINNER.length;
        status.setText(`${C_ACTION}  ${SPINNER[spinnerFrame]} Waiting for authorization in browser...${RESET}`);
        tui.requestRender();
      }, 80);

      // Switch to spinner after a short delay (gives browser time to open)
      const SPINNER_TRANSITION_MS = 1500;
      setTimeout(() => {
        if (!loginActive) return;
        status.setText(`${C_ACTION}  ${SPINNER[0]} Waiting for authorization in browser...${RESET}`);
        tui.requestRender();
      }, SPINNER_TRANSITION_MS);

      try {
        const result = await runLoginFlow(config);
        loginActive = false;
        clearInterval(spinnerInterval);
        tui.stop();
        const name = result.user?.name ?? result.user?.email ?? "user";
        process.stdout.write(`\n${C_SUCCESS}  ✓ Logged in as ${name}${RESET}\n\n`);
        resolve("loggedin");
      } catch (err) {
        loginActive = false;
        clearInterval(spinnerInterval);
        const msg = err instanceof Error ? err.message : String(err);
        root.removeChild(status);
        root.addChild(new Text(`${C_ERROR}  Login failed: ${msg}${RESET}\n`));
        root.addChild(new Text(`${C_GRAY}  Press any key to continue without login...${RESET}`));
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
      if (loginActive) return { consume: false };
      select.handleInput(data);
      tui.requestRender();
      return { consume: true };
    });

    tui.start();
  });
}
