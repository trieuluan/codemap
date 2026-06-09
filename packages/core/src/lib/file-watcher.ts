import * as parcelWatcher from "@parcel/watcher";
import { IGNORED_NAMES } from "@codemap-ai/code-index";

export interface FileWatcherConfig {
  workspaceRootPath: string;
  debounceMs?: number;
  ignoredPatterns?: string[];
  onEvent?: (event: FileWatchEvent) => void | Promise<void>;
}

export interface FileWatchEvent {
  type: "create" | "update" | "delete";
  path: string;
  relativePath: string;
}

interface PendingEvent {
  type: FileWatchEvent["type"];
  path: string;
  relativePath: string;
  timestamp: number;
}

export class IndexWatcher {
  private subscription: parcelWatcher.AsyncSubscription | null = null;
  private config: Required<FileWatcherConfig>;
  private pendingEvents: Map<string, PendingEvent> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: FileWatcherConfig) {
    this.config = {
      workspaceRootPath: config.workspaceRootPath,
      debounceMs: config.debounceMs ?? 200,
      ignoredPatterns: config.ignoredPatterns ?? [],
      onEvent: config.onEvent ?? (() => {}),
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      this.subscription = await parcelWatcher.subscribe(
        this.config.workspaceRootPath,
        (err, events) => {
          if (err) {
            console.error("[IndexWatcher] Error:", err);
            return;
          }

          for (const event of events) {
            this.handleRawEvent(event);
          }
        },
        {
          ignore: [...IGNORED_NAMES, ...this.config.ignoredPatterns],
        },
      );

      this.isRunning = true;
      console.log(
        `[IndexWatcher] Started watching ${this.config.workspaceRootPath}`,
      );
    } catch (error) {
      console.error("[IndexWatcher] Failed to start:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Flush any pending events before stopping
    await this.flush();

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }

    this.isRunning = false;
    this.pendingEvents.clear();
    console.log("[IndexWatcher] Stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private handleRawEvent(event: parcelWatcher.Event): void {
    const relativePath = event.path.replace(
      this.config.workspaceRootPath + "/",
      "",
    );

    // Map parcel event types to our types
    let type: FileWatchEvent["type"];
    if (event.type === "create") {
      type = "create";
    } else if (event.type === "update") {
      type = "update";
    } else if (event.type === "delete") {
      type = "delete";
    } else {
      // Ignore unknown event types
      return;
    }

    // Coalesce events by file path
    this.pendingEvents.set(relativePath, {
      type,
      path: event.path,
      relativePath,
      timestamp: Date.now(),
    });

    // Schedule flush
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flush().catch((err) => {
        console.error("[IndexWatcher] Flush error:", err);
      });
    }, this.config.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.pendingEvents.size === 0) {
      return;
    }

    const events = Array.from(this.pendingEvents.values());
    this.pendingEvents.clear();

    // Process events in order
    for (const event of events) {
      const watchEvent: FileWatchEvent = {
        type: event.type,
        path: event.path,
        relativePath: event.relativePath,
      };

      try {
        await this.config.onEvent(watchEvent);
      } catch (error) {
        console.error(
          `[IndexWatcher] Error processing event for ${event.relativePath}:`,
          error,
        );
      }
    }
  }
}
