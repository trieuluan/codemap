/**
 * Simple smoke test to verify file watcher architecture loads correctly.
 * Run with: npx tsx packages/core/tests/file-watcher-smoke.test.ts
 */

import path from "node:path";

async function runTests() {
  console.log("Running file watcher smoke tests...\n");
  
  // Import all modules to verify they load
  const modules = [
    "../src/lib/file-watcher.js",
    "../src/lib/symbol-dependency.js", 
    "../src/lib/watch-event-handler.js",
    "../src/lib/auto-indexing.js",
    "../src/lib/local-index.js",
  ];

  for (const mod of modules) {
    try {
      const module = await import(mod);
      const name = path.basename(mod);
      console.log(`✓ ${name}`);
      
      // Log exported symbols for key modules
      if (name === "file-watcher.js" && module.IndexWatcher) {
        console.log("  └─ IndexWatcher class available");
      } else if (name === "symbol-dependency.js" && module.SymbolDependencyGraph) {
        console.log("  └─ SymbolDependencyGraph class available");
      } else if (name === "watch-event-handler.js" && module.WatchEventHandler) {
        console.log("  └─ WatchEventHandler class available");
      } else if (name === "auto-indexing.js") {
        const exports = Object.keys(module).filter(k => !k.startsWith("_"));
        console.log(`  └─ Exports: ${exports.join(", ")}`);
      } else if (name === "local-index.js") {
        const refreshExits = module.refreshLocalFile && module.refreshLocalFiles;
        console.log(`  └─ refreshLocalFile${refreshExits ? " ✓" : ""}, refreshLocalFiles${module.refreshLocalFiles ? " ✓" : ""}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${mod}:`, message);
      return false;
    }
  }

  console.log("\n✅ All modules loaded successfully!");
  console.log("🔧 File watcher architecture is ready.");
  console.log("\nUsage example:");
  console.log(`
  import { enableAutoIndexing, disableAutoIndexing, isAutoIndexingActive } from "./lib/auto-indexing.js";
  import { getLocalIndexWithSummary } from "./lib/local-index.js";
  
  // Get index store
  const { store } = await getLocalIndexWithSummary();
  
  // Start watching
  await enableAutoIndexing(store, "/path/to/workspace");
  console.log("Auto-indexing active:", isAutoIndexingActive());
  
  // Stop watching later
  await disableAutoIndexing();
  `);
  
  return true;
}

// Run tests
runTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
