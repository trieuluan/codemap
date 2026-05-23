import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServerConfig } from "../config.js";
import { success, withToolError } from "../lib/tool-response.js";
import { execa } from "execa";
import { readFile as fsReadFile } from "node:fs/promises";

export function registerRunTestsTool(
  server: McpServer,
  config: McpServerConfig,
) {
  server.registerTool(
    "run_tests",
    {
      title: "Run Tests",
      description:
        "Run test suite for the project. " +
        "Supports running all tests, specific test files, or tests by pattern. " +
        "Returns test results including pass/fail status, duration, and any failures.",
      inputSchema: {
        test_pattern: z
          .string()
          .optional()
          .describe(
            "Pattern to match test files (glob pattern or regex). " +
              "If omitted, runs all tests. Examples: 'src/**/*.test.ts', 'integration/**/*'." +
              "For Jest/Vitest, this filters test files by name.",
          ),
        test_name: z
          .string()
          .optional()
          .describe(
            "Run only tests that match this name pattern (regex). " +
              "Uses Jest's '-t' flag or Vitest's '--name' flag.",
          ),
        coverage: z
          .boolean()
          .optional()
          .describe("Enable coverage collection. Default: false."),
        debug: z
          .boolean()
          .optional()
          .describe("Run in debug mode with --inspect. Default: false."),
        max_workers: z
          .number()
          .optional()
          .describe("Maximum number of workers for parallel test execution."),
        project_id: z
          .uuid()
          .optional()
          .describe(
            "CodeMap project UUID. Auto-resolved from workspace if omitted.",
          ),
      },
    },
    withToolError(
      async ({
        test_pattern,
        test_name,
        coverage,
        debug,
        max_workers,
        project_id,
      }) => {
        const workspaceRoot = process.cwd();

        // Build the test command based on available package manager and test framework
        const hasJest = await fileExists(`${workspaceRoot}/package.json`)
          .then(async (exists) => {
            if (!exists) return false;
            const pkg = JSON.parse(
              await readFile(`${workspaceRoot}/package.json`, "utf-8"),
            );
            return Boolean(pkg.devDependencies?.jest || pkg.dependencies?.jest);
          })
          .catch(() => false);

        const hasVitest = await fileExists(`${workspaceRoot}/package.json`)
          .then(async (exists) => {
            if (!exists) return false;
            const pkg = JSON.parse(
              await readFile(`${workspaceRoot}/package.json`, "utf-8"),
            );
            return Boolean(
              pkg.devDependencies?.vitest || pkg.dependencies?.vitest,
            );
          })
          .catch(() => false);

        const hasPlaywright = await fileExists(`${workspaceRoot}/package.json`)
          .then(async (exists) => {
            if (!exists) return false;
            const pkg = JSON.parse(
              await readFile(`${workspaceRoot}/package.json`, "utf-8"),
            );
            return Boolean(
              pkg.devDependencies?.["@playwright/test"] ||
              pkg.dependencies?.["@playwright/test"],
            );
          })
          .catch(() => false);

        let command = "";
        let args: string[] = [];

        if (hasPlaywright) {
          command = "npx";
          args = ["playwright", "test"];
          if (test_pattern) args.push(test_pattern);
          if (test_name) args.push("-g", test_name);
          if (coverage) args.push("--coverage");
        } else if (hasVitest) {
          command = "npx";
          args = ["vitest", "run"];
          if (test_pattern) args.push(test_pattern);
          if (test_name) args.push("--name", test_name);
          if (coverage) args.push("--coverage");
          if (debug) args.push("--inspect");
          if (max_workers) args.push("--workers", max_workers.toString());
        } else if (hasJest) {
          command = "npx";
          args = ["jest", "--ci", "--reporters=default"];
          if (test_pattern) args.push(test_pattern);
          if (test_name) args.push("-t", test_name);
          if (coverage) args.push("--coverage");
          if (max_workers) args.push("--maxWorkers", max_workers.toString());
        } else {
          // Default to npm test with optional pattern
          command = "npm";
          args = ["run", "test"];
          if (test_pattern) {
            // Pass pattern via env var for npm scripts
            args.push("--");
            args.push("--testNamePattern", test_pattern || "**/*.test.ts");
          }
        }

        try {
          const result = await execa(command, args, {
            cwd: workspaceRoot,
            stdio: ["pipe", "pipe", "pipe"],
            env: {
              ...process.env,
              CI: "true",
              NODE_OPTIONS: debug ? "--inspect" : undefined,
            },
          });

          const output = result.stdout || "";
          const stderr = result.stderr || "";

          // Parse test results
          const testResults = parseTestOutput(
            output,
            hasJest,
            hasVitest,
            hasPlaywright,
          );

          const summary = buildSummary(
            testResults,
            output,
            stderr,
            result.exitCode,
          );

          return success(summary, {
            command: `${command} ${args.join(" ")}`,
            workspaceRoot,
            exitCode: result.exitCode,
            signal: result.signal,
            durationMs: result.durationMs,
            ...testResults,
            rawOutput: {
              stdout: output,
              stderr,
            },
          });
        } catch (error: any) {
          // execa throws on non-zero exit, but we want to capture it
          const output = error.stdout || "";
          const stderr = error.stderr || "";

          const testResults = parseTestOutput(
            output,
            hasJest,
            hasVitest,
            hasPlaywright,
          );

          const summary = buildSummary(
            testResults,
            output,
            stderr,
            error.exitCode,
          );

          return success(summary, {
            command: `${command} ${args.join(" ")}`,
            workspaceRoot,
            exitCode: error.exitCode,
            signal: error.signal,
            durationMs: error.duration,
            ...testResults,
            rawOutput: {
              stdout: output,
              stderr,
            },
            isError: true,
          });
        }
      },
    ),
  );
}

// Helper functions for parsing and formatting
async function fileExists(path: string): Promise<boolean> {
  try {
    await import("node:fs/promises").then((fs) => fs.access(path));
    return true;
  } catch {
    return false;
  }
}

async function readFile(
  path: string,
  encoding: BufferEncoding,
): Promise<string> {
  return fsReadFile(path, { encoding });
}

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: Array<{ name: string; error?: string }>;
  duration: number;
}

function parseTestOutput(
  output: string,
  hasJest: boolean,
  hasVitest: boolean,
  hasPlaywright: boolean,
): TestResults {
  const lines = output.split("\n");
  const result: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    failedTests: [],
    duration: 0,
  };

  // Parse Jest output
  if (hasJest) {
    // Look for test summary section
    const summaryLine = lines.find(
      (l) => l.includes("Test Suites") && l.includes("tests"),
    );
    if (summaryLine) {
      const match = summaryLine.match(/(\d+) tests?/);
      if (match) result.total = parseInt(match[1], 10);
    }

    // Count passes/failures from Jest snapshot
    lines.forEach((line) => {
      if (line.includes("PASS")) result.passed++;
      if (line.includes("FAIL")) result.failed++;
    });

    // Extract failed test names
    const failMatches = output.matchAll(/✕ (.+?)(?:\n|$)/g);
    for (const match of failMatches) {
      result.failedTests.push({ name: match[1] });
    }
  }

  // Parse Vitest output
  if (hasVitest) {
    const summaryLine = lines.find((l) => l.includes("Test Files"));
    if (summaryLine) {
      const totalMatch = summaryLine.match(/(\d+) testFiles/);
      if (totalMatch) result.total = parseInt(totalMatch[1], 10);
    }

    // Check for passed/failed counts in summary
    const passMatch = output.match(/(\d+) passed/);
    if (passMatch) result.passed = parseInt(passMatch[1], 10);

    const failMatch = output.match(/(\d+) failed/);
    if (failMatch) result.failed = parseInt(failMatch[1], 10);
  }

  // Parse Playwright output
  if (hasPlaywright) {
    const summaryLine = lines.find(
      (l) => l.includes("PASS") || l.includes("FAIL"),
    );
    if (summaryLine) {
      const totalMatch = summaryLine.match(/(\d+) tests?/);
      if (totalMatch) result.total = parseInt(totalMatch[1], 10);
    }
  }

  // Try to extract duration
  const durationMatch = output.match(/(\d+)ms/);
  if (durationMatch) {
    result.duration = parseInt(durationMatch[1], 10);
  }

  return result;
}

function buildSummary(
  results: TestResults,
  stdout: string,
  stderr: string,
  exitCode: number | undefined,
): string {
  const lines: string[] = [];

  lines.push("## Test Results");
  lines.push("");
  lines.push(`Status: ${exitCode === 0 ? "✅ PASS" : "❌ FAIL"}`);
  lines.push("");
  lines.push("| | Count |");
  lines.push("|---|---|");
  lines.push(`| Total | ${results.total} |`);
  lines.push(`| Passed | ${results.passed} |`);
  lines.push(`| Failed | ${results.failed} |`);
  lines.push(`| Skipped | ${results.skipped} |`);
  lines.push(`| Duration | ${results.duration}ms |`);
  lines.push("");

  if (results.failedTests.length > 0) {
    lines.push("### Failed Tests");
    lines.push("");
    results.failedTests.forEach((test, i) => {
      lines.push(`${i + 1}. **${test.name}**`);
      if (test.error) {
        lines.push("");
        lines.push(`   \`\`\`text`);
        lines.push(test.error.split("\n").slice(0, 5).join("\n"));
        lines.push(`\`\`\``);
      }
    });
    lines.push("");
  }

  if (stderr) {
    lines.push("### Stderr");
    lines.push("");
    lines.push("```");
    lines.push(stderr);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}
