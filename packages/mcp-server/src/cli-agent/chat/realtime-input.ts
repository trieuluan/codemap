import readline from "node:readline";
import { stdin, stdout } from "node:process";

type RealtimeInputOptions = {
  prompt?: string;
  onSubmit: (input: string) => Promise<boolean | void>;
  onMention: () => Promise<string | undefined>;
};

export function startRealtimeInput(options: RealtimeInputOptions): () => void {
  const prompt = options.prompt ?? "codemap> ";
  let active = true;
  let busy = false;

  if (stdin.isTTY) {
    // TTY mode: keypress handling
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);

    let buffer = "";

    function render() {
      if (!active) return;
      stdout.clearLine(0);
      stdout.cursorTo(0);
      stdout.write(`${prompt}${buffer}`);
    }

    function newline() {
      if (!active) return;
      stdout.write("\n");
    }

    function stop() {
      if (!active) return;
      active = false;
      stdin.pause();
      stdin.setRawMode(false);
      stdin.off("keypress", handleKeypress);
    }

    function handleKeypress(str: string | undefined, key: readline.Key) {
      if (!active || busy) return;
      if (key.ctrl && key.name === "c") {
        stdout.write("\n");
        stop();
        return;
      }

      if (key.name === "return") {
        const input = buffer.trim();

        if (!input) {
          newline();
          stdout.write(prompt);
          return;
        }

        buffer = "";
        newline();
        pauseRawMode();
        busy = true;
        (async () => {
          try {
            const shouldContinue = await options.onSubmit(input);
            if (shouldContinue === false) {
              stop();
              return;
            }
          } finally {
            busy = false;
            restoreRawMode();
          }
          if (active) stdout.write(prompt);
        })();
        return;
      }

      if (key.name === "backspace") {
        buffer = buffer.slice(0, -1);
        render();
        return;
      }

      if (str === "@") {
        newline();
        pauseRawMode();
        busy = true;
        (async () => {
          try {
            const selected = await options.onMention();
            if (selected) {
              buffer += `@${selected}`;
            }
          } finally {
            busy = false;
            restoreRawMode();
          }
          render();
        })();
        return;
      }

      if (str && !key.ctrl && !key.meta) {
        buffer += str;
        stdout.write(str);
      }
    }

    function pauseRawMode() {
      stdin.off("keypress", handleKeypress);
      if (stdin.isTTY) stdin.setRawMode(false);
    }

    function restoreRawMode() {
      if (active) stdin.resume();
      if (active && stdin.isTTY) stdin.setRawMode(true);
      if (active) stdin.on("keypress", handleKeypress);
    }

    stdin.on("keypress", handleKeypress);
    stdout.write(prompt);
    stdin.resume();

    return stop;
  } else {
    // Non-TTY mode: line-by-line input
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
      terminal: false,
    });

    rl.prompt = () => {
      stdout.write(prompt);
    };

    rl.on("line", (input) => {
      if (!active) return;
      (async () => {
        try {
          const shouldContinue = await options.onSubmit(input.trim());
          if (shouldContinue === false) {
            stop();
            return;
          }
          if (active) rl.prompt();
        } catch (err) {
          console.error(`Error processing input: ${err}`);
          if (active) rl.prompt();
        }
      })();
    });

    rl.on("close", () => {
      stop();
    });

    function stop() {
      if (!active) return;
      active = false;
      rl.close();
    }

    rl.prompt();
    return stop;
  }
}
