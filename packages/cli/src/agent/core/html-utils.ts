// Convert HTML tables to pipe-separated rows and strip all other HTML tags.
// Handles both complete tables (with closing </table>) and partial/streaming
// content where the closing tag hasn't arrived yet.
// Used in both the renderer (display) and session-store (load-time cleanup).
export function normalizeHtml(text: string): string {
  return text
    // Complete tables: convert to pipe-separated rows.
    .replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, body: string) => {
      const rows: string[] = [];
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let row: RegExpExecArray | null;
      while ((row = rowRe.exec(body)) !== null) {
        const cells: string[] = [];
        const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
        let cell: RegExpExecArray | null;
        while ((cell = cellRe.exec(row[1] ?? "")) !== null) {
          cells.push((cell[1] ?? "").replace(/<[^>]+>/g, "").trim());
        }
        if (cells.length > 0) rows.push(cells.join(" | "));
      }
      return rows.join("\n");
    })
    // Incomplete/streaming tables: strip the open tag and everything inside.
    .replace(/<table[^>]*>[\s\S]*/gi, "")
    // Strip all remaining HTML tags (including orphaned </tr>, </td>, etc.)
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
