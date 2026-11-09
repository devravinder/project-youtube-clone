import { context, propagation, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { untraced, withConsumerSpan, withProducerSpan, withStoredContext } from "./messaging.js";
import { injectContext } from "./propagation.js";

const exporter = new InMemorySpanExporter();

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  trace.setGlobalTracerProvider(
    new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }),
  );
});
afterAll(() => {
  trace.disable();
  context.disable();
  propagation.disable();
});
beforeEach(() => exporter.reset());

const spans = () => exporter.getFinishedSpans();
const parentId = (s: ReturnType<typeof spans>[number]) => s.parentSpanContext?.spanId;

describe("message spans", () => {
  it("producer span hands its own context to the headers", async () => {
    const headers = await withProducerSpan(
      "t publish",
      { "messaging.system": "kafka" },
      async (h) => h,
    );

    const [span] = spans();
    expect(span?.kind).toBe(SpanKind.PRODUCER);
    expect(span?.attributes["messaging.system"]).toBe("kafka");
    expect(headers.traceparent).toBe(
      `00-${span?.spanContext().traceId}-${span?.spanContext().spanId}-01`,
    );
  });

  it("consumer span continues the producer's trace across the broker", async () => {
    const headers = await withProducerSpan("t publish", {}, async (h) => h);
    await withConsumerSpan(
      "t process",
      new Map(Object.entries(headers)),
      {},
      async () => undefined,
    );

    const [producer, consumer] = spans();
    expect(consumer?.kind).toBe(SpanKind.CONSUMER);
    expect(consumer?.spanContext().traceId).toBe(producer?.spanContext().traceId);
    expect(parentId(consumer!)).toBe(producer?.spanContext().spanId);
  });

  it("a message without a traceparent starts a new trace", async () => {
    await withConsumerSpan("t process", {}, {}, async () => undefined);

    expect(spans()[0]?.parentSpanContext).toBeUndefined();
  });

  it("records a failure on the span and rethrows", async () => {
    await expect(
      withConsumerSpan("t process", {}, {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(spans()[0]?.status).toEqual({ code: SpanStatusCode.ERROR, message: "boom" });
    expect(spans()[0]?.events[0]?.name).toBe("exception");
  });
});

describe("outbox-style deferred work", () => {
  it("work run later joins the trace that was stored", async () => {
    const tracer = trace.getTracer("test");
    const stored = await tracer.startActiveSpan("POST /uploads/:id/complete", async (span) => {
      const carrier = injectContext();
      span.end();
      return carrier;
    });

    // Later, from a timer, with no request around:
    await withStoredContext(stored, () => withProducerSpan("q publish", {}, async () => undefined));

    const [request, publish] = spans();
    expect(publish?.spanContext().traceId).toBe(request?.spanContext().traceId);
    expect(parentId(publish!)).toBe(request?.spanContext().spanId);
  });

  it("untraced housekeeping records nothing, but stored work inside it still traces", async () => {
    const tracer = trace.getTracer("test");
    const stored = await tracer.startActiveSpan("request", async (span) => {
      span.end();
      return injectContext();
    });
    exporter.reset();

    await untraced(async () => {
      tracer.startSpan("poll query").end();
      await withStoredContext(stored, () =>
        withProducerSpan("q publish", {}, async () => undefined),
      );
    });

    expect(spans().map((s) => s.name)).toEqual(["q publish"]);
  });
});
