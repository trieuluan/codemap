
export type Command =
  | "help"
  | "version"
  | "doctor"
  | "ask"
  | "chat"
  | "models";

export type Flags = Record<string, string | undefined>;

export interface ParsedArgs {
  command: Command;
  flags: Flags;
  positional: string;
}

export function parseArgs(argv: string[]): ParsedArgs {
  return {
    command: parseCommand(argv),
    flags: parseFlags(argv),
    positional: readPositional(argv),
  };
}


export function hasFlag(flags: Flags, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(flags, key);
}

function parseCommand(argv: string[]): Command {
  if (argv.includes("--help") || argv.includes("-h")) return "help";
  // Skip POSIX "--" separator, flags, and their values to find the actual command
  const first = argv.find((arg, index) => {
    if (arg === "--") return false; // POSIX end-of-flags
    if (arg.startsWith("-")) return false;
    // Skip values that follow a flag (e.g. --prompt "text" → skip "text")
    const prev = argv[index - 1];
    if (prev && prev !== "--" && prev.startsWith("--") && !prev.includes("=")) return false;
    return true;
  });
  if (!first) return "chat";
  if (first === "help") return "help";
  if (first === "--version" || first === "-v") return "version";
  if (isCommand(first)) return first;
  throw new Error(`Unknown command "${first}". Run "codemap --help".`);
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") break; // POSIX end-of-flags separator
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    flags[key] = inlineValue ?? argv[index + 1];
  }
  return flags;
}

function readPositional(argv: string[]): string {
  const args = argv.filter((arg, index) => {
    if (arg === "--") return false; // POSIX separator, not positional
    if (index === 0 && isCommand(arg)) return false;
    if (arg.startsWith("--")) return false;
    if (index > 0 && argv[index - 1]?.startsWith("--") && !argv[index - 1]?.includes("=")) {
      return false;
    }
    return true;
  });
  return args.join(" ").trim();
}

function isCommand(value: string): value is Command {
  return (
    value === "help" ||
    value === "version" ||
    value === "doctor" ||
    value === "ask" ||
    value === "chat" ||
    value === "models"
  );
}
