type DynamicImport = (specifier: string) => Promise<Record<string, unknown>>;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as DynamicImport;

export interface MastraTuiPrototypeResult {
  started: boolean;
  reason?: string;
}

export async function startMastraTuiPrototype(): Promise<MastraTuiPrototypeResult> {
  try {
    const mod = await dynamicImport("mastracode/tui");
    if (typeof mod.MastraTUI !== "function") {
      return {
        started: false,
        reason: 'Package "mastracode/tui" loaded, but MastraTUI was not exported.',
      };
    }

    return {
      started: false,
      reason:
        "MastraTUI is available, but the CodeMap Harness bridge is not wired yet.",
    };
  } catch (err) {
    return {
      started: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
