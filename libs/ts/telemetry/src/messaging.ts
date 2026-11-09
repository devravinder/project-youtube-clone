import {
  type Attributes,
  type Context,
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { suppressTracing } from "@opentelemetry/core";
import { type Carrier, contextFromCarrier, injectContext } from "./propagation.js";

const tracer = () => trace.getTracer("@yt/telemetry");

async function inSpan<T>(
  name: string,
  kind: SpanKind,
  attributes: Attributes,
  parent: Context,
  fn: () => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, { kind, attributes }, parent, async (span) => {
    try {
      return await fn();
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** A producer span for a client with no instrumentation; fn gets the headers that carry it on. */
export function withProducerSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (headers: Carrier) => Promise<T>,
): Promise<T> {
  return inSpan(name, SpanKind.PRODUCER, attributes, context.active(), () => fn(injectContext()));
}

/** A consumer span that continues the trace found in the message headers. */
export function withConsumerSpan<T>(
  name: string,
  headers: Carrier | Map<string, string>,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  return inSpan(name, SpanKind.CONSUMER, attributes, contextFromCarrier(headers), fn);
}

/** Runs fn as part of the trace stored in carrier, e.g. an outbox row written during a request. */
export function withStoredContext<T>(
  carrier: Carrier | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return context.with(contextFromCarrier(carrier), fn);
}

/** Housekeeping (polling, flushing) that would otherwise start a new trace every second. */
export function untraced<T>(fn: () => Promise<T>): Promise<T> {
  return context.with(suppressTracing(context.active()), fn);
}
