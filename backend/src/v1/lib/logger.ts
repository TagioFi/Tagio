// Structured, single-line JSON logs -- greppable by "event" in Render's log
// viewer without needing a separate log aggregation service. Deliberately never
// takes raw request/response bodies as input: callers pass only named fields,
// so secrets (JWTs, signatures, wallet private state) can't accidentally end up
// in a log line just because they were nearby.
type LogMeta = Record<string, unknown>;

function emit(level: "info" | "warn" | "error", event: string, meta?: LogMeta): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...meta });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, meta?: LogMeta) => emit("info", event, meta),
  warn: (event: string, meta?: LogMeta) => emit("warn", event, meta),
  error: (event: string, meta?: LogMeta) => emit("error", event, meta),
};
