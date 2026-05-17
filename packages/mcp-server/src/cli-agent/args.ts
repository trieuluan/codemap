
export type Command =
  | "help"
  | "doctor"
  | "route"
  | "ask"
  | "chat"
  | "models"
  | "status"
  | "init-gateway";

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
  const first = argv.find((arg) => !arg.startsWith("-"));
  if (!first || first === "help") return "help";
  if (isCommand(first)) return first;
  throw new Error(`Unknown command "${first}". Run "codemap --help".`);
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    flags[key] = inlineValue ?? argv[index + 1];
  }
  return flags;
}

function readPositional(argv: string[]): string {
  const args = argv.filter((arg, index) => {
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
    value === "doctor" ||
    value === "route" ||
    value === "ask" ||
    value === "chat" ||
    value === "models" ||
    value === "status" ||
    value === "init-gateway"
  );
}
