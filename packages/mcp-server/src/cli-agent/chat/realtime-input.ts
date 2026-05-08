import readline from "node:readline";
import { stdin, stdout } from "node:process";

type RealtimeInputOptions = {
  prompt?: string;
  onSubmit: (input: string) => Promise<void>;
  onMention: (input: string) => Promise<string | undefined>;
};

export function startRealtimeInput(options: RealtimeInputOptions) {
  const prompt = options.prompt ?? "codemap> ";
  let buffer = "";

  readline.emitKeypressEvents(stdin);

  if (stdin.isTTY) {
    stdin.setRawMode(true);
  }

  function render() {
    stdout.clearLine(0);
    stdout.cursorTo(0);
    stdout.write(`${prompt}${buffer}`);
  }

  function resetPrompt() {
    buffer = "";
    stdout.write("\n");
    stdout.write(prompt);
  }

  stdout.write(prompt);

  stdin.on("keypress", async (str, key) => {
    if (key.ctrl && key.name === "c") {
      stdout.write("\n");
      process.exit(0);
    }

    if (key.name === "return") {
      const input = buffer.trim();

      if (!input) {
        resetPrompt();
        return;
      }

      resetPrompt();
      await options.onSubmit(input);
      stdout.write(prompt);
      return;
    }

    if (key.name === "backspace") {
      buffer = buffer.slice(0, -1);
      render();
      return;
    }

    if (str === "@") {
      if (stdin.isTTY) stdin.setRawMode(false);

      stdout.write("\n");
      const selected = await options.onMention(str);

      if (stdin.isTTY) stdin.setRawMode(true);

      if (selected) {
        buffer += `@${selected}`;
      }

      render();
      return;
    }

    if (str && !key.ctrl && !key.meta) {
      buffer += str;
      stdout.write(str);
    }
  });
}
