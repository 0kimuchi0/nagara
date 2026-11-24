/** テスト専用: 呼び出しを記録するだけの Canvas 代用品 */
export function stubCtx() {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const gradient = { addColorStop: (...a: unknown[]) => void calls.push({ name: "addColorStop", args: a }) };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        if (prop === "createRadialGradient" || prop === "createLinearGradient") return gradient;
        return undefined;
      };
    },
    set(target, prop: string, value) {
      target[prop] = value;
      calls.push({ name: `set:${prop}`, args: [value] });
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}
