import * as assert from "node:assert";
import { test } from "node:test";
import {
  parseGithubRepositoryUrl,
  resolveGithubRepositorySource,
} from "../../../src/modules/project-import/github-source";

test("parseGithubRepositoryUrl normalizes owner and repo", () => {
  assert.deepStrictEqual(
    parseGithubRepositoryUrl("https://github.com/openai/codex.git/"),
    {
      owner: "openai",
      repo: "codex",
      normalizedUrl: "https://github.com/openai/codex",
    },
  );
});

test("parseGithubRepositoryUrl rejects unsupported providers", () => {
  assert.throws(
    () => parseGithubRepositoryUrl("https://gitlab.com/openai/codex"),
    /Only public GitHub repository URLs are supported/,
  );
});

test("resolveGithubRepositorySource uses the preferred branch when provided", async () => {
  const resolvedSource = await resolveGithubRepositorySource({
    repositoryUrl: "https://github.com/openai/codex",
    preferredBranch: "main",
  }, {
    verifyBranchExists: async (_repositoryUrl, branch) => branch,
  });

  assert.equal(resolvedSource.branch, "main");
  assert.equal(resolvedSource.reference.owner, "openai");
  assert.equal(resolvedSource.reference.repo, "codex");
});

test("resolveGithubRepositorySource rejects a missing preferred branch", async () => {
  await assert.rejects(
    () =>
      resolveGithubRepositorySource(
        {
          repositoryUrl: "https://github.com/openai/codex",
          preferredBranch: "missing-branch",
        },
        {
          verifyBranchExists: async () => {
            throw new Error(
              'Branch "missing-branch" does not exist in this public GitHub repository',
            );
          },
        },
      ),
    /does not exist in this public GitHub repository/,
  );
});
