export function extractLastFileMention(input: string) {
  const match = input.match(/@([^\s]*)$/);

  if (!match) {
    return null;
  }

  return {
    raw: match[0],
    query: match[1] ?? "",
    start: match.index ?? input.length - match[0].length,
    end: input.length,
  };
}

export function replaceMentionWithPath(
  input: string,
  mention: { start: number; end: number },
  path: string,
) {
  return `${input.slice(0, mention.start)}@${path}${input.slice(mention.end)}`;
}
