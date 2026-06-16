// Decode HTML entities that marked may leave encoded in raw text.
// Table conversion is handled by the CLI renderer's html() token handler
// using node-html-parser (regex on raw text cannot distinguish <table>
// inside backticks from real HTML table blocks).
export function normalizeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
