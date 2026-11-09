import { type Carrier, injectContext } from "@yt/telemetry";

/** The active trace as headers to store with an outbox row; undefined (no column value) when untraced. */
export function currentTraceContext(): Carrier | undefined {
  const carrier = injectContext();
  return Object.keys(carrier).length > 0 ? carrier : undefined;
}
