export function safeInternalPath(value: string | null | undefined, fallback = "/cuenta"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\r") || value.includes("\n")) {
    return fallback;
  }
  try {
    const resolved = new URL(value, "https://a-mano.invalid");
    if (resolved.origin !== "https://a-mano.invalid") return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
