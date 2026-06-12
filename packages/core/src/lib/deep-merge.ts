// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target } as any;
  for (const key of Object.keys(source) as Array<keyof T>) {
    const srcVal = (source as any)[key];
    const tgtVal = (target as any)[key];
    if (srcVal instanceof Set || srcVal instanceof Map) {
      result[key] = srcVal;
    } else if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }
  return result as T;
}
