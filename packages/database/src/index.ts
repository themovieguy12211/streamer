export { supabase } from './client.js';
export * from './schema.js';
export function toCamel<T>(obj: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ck = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[ck] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? toCamel(v as Record<string, unknown>) : v;
  }
  return out as T;
}
