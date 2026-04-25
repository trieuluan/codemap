export function readPositiveIntegerEnv(
  envName: string,
  defaultValue: number,
  env: NodeJS.ProcessEnv = process.env,
) {
  const rawValue = env[envName];

  if (!rawValue) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    console.warn(
      `Invalid ${envName} value "${rawValue}". Falling back to ${defaultValue}.`,
    );
    return defaultValue;
  }

  return parsedValue;
}
