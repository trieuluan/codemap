import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BG_DIFF_ADD,
  C_ACTION,
  C_CYAN,
  CODEMAP_DARK_THEME,
  getTheme,
  resetTheme,
  setTheme,
} from "./theme.js";
import { findThemeFile, listTerminalThemes, loadTerminalTheme } from "./theme-loader.js";

test("built-in codemap dark theme preserves original palette", () => {
  resetTheme();

  assert.equal(C_CYAN, "\x1b[1m\x1b[38;2;88;213;247m");
  assert.equal(C_ACTION, "\x1b[1m\x1b[38;2;88;213;247m");
  assert.equal(BG_DIFF_ADD, "\x1b[48;2;0;55;18m");
  assert.equal(getTheme().name, CODEMAP_DARK_THEME.name);
});

test("setTheme merges partial token overrides with codemap dark defaults", () => {
  setTheme({
    name: "custom",
    text: { action: { color: { r: 1, g: 2, b: 3 }, bold: true } },
    background: { diffAdd: { r: 4, g: 5, b: 6 } },
  });

  assert.equal(C_ACTION, "\x1b[1m\x1b[38;2;1;2;3m");
  assert.equal(C_CYAN, "\x1b[1m\x1b[38;2;88;213;247m");
  assert.equal(BG_DIFF_ADD, "\x1b[48;2;4;5;6m");
  assert.equal(getTheme().name, "custom");

  resetTheme();
});

test("loadTerminalTheme loads project JSON themes by name", async () => {
  const cwd = await makeThemeFixture("test-theme", {
    text: { action: { color: { r: 9, g: 8, b: 7 } } },
  });

  const result = await loadTerminalTheme({ cwd, themeName: "test-theme" });

  assert.equal(result.themeName, "test-theme");
  assert.equal(result.source, path.join(cwd, ".codemap", "themes", "test-theme.json"));
  assert.equal(C_ACTION, "\x1b[38;2;9;8;7m");

  resetTheme();
});

test("theme discovery includes built-in and project themes", async () => {
  const cwd = await makeThemeFixture("listed-theme", { name: "listed-theme" });

  assert.equal(await findThemeFile("listed-theme", cwd), path.join(cwd, ".codemap", "themes", "listed-theme.json"));
  assert.deepEqual(await listTerminalThemes(cwd), ["codemap-dark", "listed-theme"]);
});

async function makeThemeFixture(themeName: string, theme: unknown): Promise<string> {
  const cwd = path.join(tmpdir(), `codemap-theme-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const themeDir = path.join(cwd, ".codemap", "themes");
  await mkdir(themeDir, { recursive: true });
  await writeFile(path.join(themeDir, `${themeName}.json`), `${JSON.stringify(theme, null, 2)}\n`);
  return cwd;
}
