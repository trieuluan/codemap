interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class RequestTracker {
  private readonly pending = new Map<string, PendingRequest>();

  add<T>(requestId: string): Promise<T> {
    if (this.pending.has(requestId)) {
      return Promise.reject(new Error(`Duplicate request ID: ${requestId}`));
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  resolve(requestId: string, value: unknown): boolean {
    const request = this.pending.get(requestId);
    if (!request) return false;
    this.pending.delete(requestId);
    request.resolve(value);
    return true;
  }

  reject(requestId: string, error: Error): boolean {
    const request = this.pending.get(requestId);
    if (!request) return false;
    this.pending.delete(requestId);
    request.reject(error);
    return true;
  }

  rejectAll(error: Error): void {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }
}
