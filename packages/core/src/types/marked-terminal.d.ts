declare module "marked-terminal" {
  import type { MarkedExtension } from "marked";

  export interface RendererOptions {
    [key: string]: unknown;
  }

  export interface HighlightOptions {
    [key: string]: unknown;
  }

  export default class TerminalRenderer {
    options: Record<string, unknown>;
    parser: {
      parse(tokens: unknown[], top?: boolean): string;
      parseInline(tokens: unknown[]): string;
    };

    constructor(options?: RendererOptions, highlightOptions?: HighlightOptions);

    [method: string]: unknown;
  }

  export function markedTerminal(
    options?: RendererOptions,
    highlightOptions?: HighlightOptions,
  ): MarkedExtension;
}
