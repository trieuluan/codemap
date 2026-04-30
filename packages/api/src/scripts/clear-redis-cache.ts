import IORedis from "ioredis";
import {
  APP_CACHE_PATTERNS,
  cacheKeys,
  deleteByPattern,
  invalidateProjectImportCaches,
  type AppCacheNamespace,
} from "../lib/redis-cache";

interface ClearRedisCacheOptions {
  importId: string | null;
  namespace: AppCacheNamespace | null;
  allAppCache: boolean;
  includeMcpAuth: boolean;
  includeOauthState: boolean;
  help: boolean;
}

const NAMESPACE_ALIASES: Record<string, AppCacheNamespace> = {
  "project-insights": "projectInsights",
  projectInsights: "projectInsights",
};

function printHelp() {
  console.log(`Usage:
  npm --workspace=@codemap/api run redis:cache:clear -- [options]

Options:
  --import-id <id>              Clear app cache for one project import.
  --namespace project-insights  Clear one app cache namespace.
  --all-app-cache               Clear every app-level cache namespace.
  --include-oauth-state         Also clear pending GitHub/GitLab OAuth states.
  --include-mcp-auth            Also clear pending MCP auth sessions.
  --help                        Show this help text.

By default this script does not clear OAuth or MCP auth sessions.`);
}

function parseArgs(argv: string[]): ClearRedisCacheOptions {
  const options: ClearRedisCacheOptions = {
    importId: null,
    namespace: null,
    allAppCache: false,
    includeMcpAuth: false,
    includeOauthState: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--all-app-cache") {
      options.allAppCache = true;
      continue;
    }

    if (arg === "--include-mcp-auth") {
      options.includeMcpAuth = true;
      continue;
    }

    if (arg === "--include-oauth-state") {
      options.includeOauthState = true;
      continue;
    }

    if (arg === "--import-id") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--import-id requires a value");
      }
      options.importId = value;
      index += 1;
      continue;
    }

    if (arg === "--namespace") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--namespace requires a value");
      }
      const namespace = NAMESPACE_ALIASES[value];
      if (!namespace) {
        throw new Error(`Unsupported cache namespace: ${value}`);
      }
      options.namespace = namespace;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const redis = new IORedis(
    process.env.REDIS_URL || "redis://127.0.0.1:6379",
  );

  try {
    const summary: Record<string, number> = {};

    if (options.importId) {
      const result = await invalidateProjectImportCaches(redis, options.importId);
      for (const [namespace, deletedCount] of Object.entries(result)) {
        summary[namespace] = (summary[namespace] ?? 0) + deletedCount;
      }
    }

    if (options.namespace) {
      summary[options.namespace] =
        (summary[options.namespace] ?? 0) +
        (await deleteByPattern(redis, APP_CACHE_PATTERNS[options.namespace]));
    }

    if (options.allAppCache) {
      for (const [namespace, pattern] of Object.entries(APP_CACHE_PATTERNS)) {
        summary[namespace] =
          (summary[namespace] ?? 0) + (await deleteByPattern(redis, pattern));
      }
    }

    if (options.includeMcpAuth) {
      summary.mcpAuthSession =
        (summary.mcpAuthSession ?? 0) +
        (await deleteByPattern(redis, cacheKeys.mcpAuthSessionPattern()));
    }

    if (options.includeOauthState) {
      summary.githubOauthState =
        (summary.githubOauthState ?? 0) +
        (await deleteByPattern(redis, cacheKeys.githubOauthStatePattern()));
      summary.gitlabOauthState =
        (summary.gitlabOauthState ?? 0) +
        (await deleteByPattern(redis, cacheKeys.gitlabOauthStatePattern()));
    }

    if (Object.keys(summary).length === 0) {
      printHelp();
      return;
    }

    console.log("Redis cache clear summary:");
    for (const [namespace, deletedCount] of Object.entries(summary)) {
      console.log(`- ${namespace}: ${deletedCount} key(s) deleted`);
    }
  } finally {
    await redis.quit();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
