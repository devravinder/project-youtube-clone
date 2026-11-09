import { type Context, context, propagation, ROOT_CONTEXT } from "@opentelemetry/api";

// W3C trace context as plain strings: traceparent (and tracestate when set).
export type Carrier = Record<string, string>;

/** The current trace context as headers, e.g. to store with an outbox row. Empty when telemetry is off. */
export function injectContext(ctx: Context = context.active()): Carrier {
  const carrier: Carrier = {};
  propagation.inject(ctx, carrier);
  return carrier;
}

/** Rebuilds a context from stored or received headers; a carrier without traceparent starts a new trace. */
export function contextFromCarrier(
  carrier: Carrier | Map<string, string> | null | undefined,
): Context {
  if (!carrier) return ROOT_CONTEXT;
  const plain = carrier instanceof Map ? Object.fromEntries(carrier) : carrier;
  return propagation.extract(ROOT_CONTEXT, plain);
}
