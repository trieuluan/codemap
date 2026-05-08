import readline from "node:readline";
import { stdin, stdout } from "node:process";

type RealtimeInputOptions = {
  prompt?: string;
  onSubmit: (input: string) => Promise<boolean | void>;
  onMention: () => Promise<string | undefined>;
};

export function startRealtimeInput(options: RealtimeInputOptions): () => void {
  const prompt = options.prompt ?? "codemap> ";
  let buffer = "";
  let active = true;
  let busy = false;

  readline.emitKeypressEvents(stdin);

  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }

  function render() {
    if (!active) return;
    if (stdout.isTTY) {
      stdout.clearLine(0);
      stdout.cursorTo(0);
    }
    stdout.write(`${prompt}${buffer}`);
  }

  function newline() {
    if (!active) return;
    stdout.write("\n");
  }

  function restoreRawMode() {
    if (active) stdin.resume();
    if (active && stdin.isTTY) stdin.setRawMode(true);
    if (active) stdin.on("keypress", handleKeypress);
  }

  function pauseRawMode() {
    stdin.off("keypress", handleKeypress);
    if (stdin.isTTY) stdin.setRawMode(false);
  }

  function stop() {
    if (!active) return;
    active = false;
    pauseRawMode();
    stdin.off("keypress", handleKeypress);
    stdin.pause();
  }

  stdout.write(prompt);
  stdin.resume();

  async function handleKeypress(str: string | undefined, key: readline.Key) {
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
      busy = true;
      try {
        const shouldContinue = await options.onSubmit(input);
        if (shouldContinue === false) {
          stop();
          return;
        }
      } finally {
        busy = false;
      }
      if (active) stdout.write(prompt);
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
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      buffer += str;
      stdout.write(str);
    }
  }

  stdin.on("keypress", handleKeypress);
  return stop;
}
