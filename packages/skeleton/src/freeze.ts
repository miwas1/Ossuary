/** Freeze a value and everything reachable from it, so a resolved policy or manifest can't change. */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<string | symbol, unknown>)[key]);
  }
  return value;
}
