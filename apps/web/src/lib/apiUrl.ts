const raw = import.meta.env.VITE_API_BASE ?? "";
const base = typeof raw === "string" ? raw.trim().replace(/\/$/, "") : "";

/** 与开发时代理一致：path 须以 `/` 开头，如 `/api/poems`。 */
export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    throw new Error(`apiUrl: path must start with /, got ${path}`);
  }
  return base === "" ? path : `${base}${path}`;
}
