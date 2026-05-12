import { Fragment } from "react";
import { Box, Text } from "ink";

const SHORTCUTS: [string, string][] = [
  ["[Tab]", "Complete"],
  ["[↑↓]", "History"],
  ["[@]", "Files"],
  ["[Scroll]", "Messages"],
  ["[Ctrl+C]", "Cancel"],
  ["[Esc]", "Menu"],
  ["[/]", "Commands"],
  ["[?]", "Help"],
];

export function HelpHints() {
  return (
    <Box>
      <Text>{"  "}</Text>
      {SHORTCUTS.map(([key, desc], i) => (
        <Fragment key={key}>
          <Text color="cyan">{key}</Text>
          <Text dimColor>{` ${desc}`}</Text>
          {i < SHORTCUTS.length - 1 && <Text dimColor>{"  "}</Text>}
        </Fragment>
      ))}
    </Box>
  );
}
