/**
 * A session id is the memory scope a browser tab owns: 128 random bits the
 * client mints, as 32 lowercase hex chars. Only that exact shape is accepted,
 * so readable labels like "session-a" (which every visitor used to share) fail
 * closed. Malformed ids are rejected, never truncated, so two ids cannot collapse
 * into one scope. The server can check the shape, not the randomness: a client
 * that picks a weak id only exposes its own scope.
 */
const SESSION_ID = /^[0-9a-f]{32}$/;

/** Returns the id when it is a well-formed scope id, otherwise null (callers fail closed). */
export function parseSessionId(raw: unknown): string | null {
  return typeof raw === "string" && SESSION_ID.test(raw) ? raw : null;
}
