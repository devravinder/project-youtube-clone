import { context, propagation, trace, TraceFlags } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { describe, expect, it } from "vitest";
import { telemetryEnabled } from "./enabled.js";
import { contextFromCarrier, injectContext } from "./propagation.js";

describe("telemetryEnabled", () => {
  it("is on only for local-observability or when forced", () => {
    expect(telemetryEnabled({ APP_ENV: "local" })).toBe(false);
    expect(telemetryEnabled({})).toBe(false);
    expect(telemetryEnabled({ APP_ENV: "local-observability" })).toBe(true);
    expect(telemetryEnabled({ APP_ENV: "local", OTEL_ENABLED: "true" })).toBe(true);
  });

  it("can be switched off even in local-observability", () => {
    expect(telemetryEnabled({ APP_ENV: "local-observability", OTEL_ENABLED: "false" })).toBe(false);
    expect(telemetryEnabled({ APP_ENV: "local-observability", OTEL_SDK_DISABLED: "true" })).toBe(
      false,
    );
  });
});

describe("trace context carriers", () => {
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  const spanContext = {
    traceId: "0af7651916cd43dd8448eb211c80319c",
    spanId: "b7ad6b7169203331",
    traceFlags: TraceFlags.SAMPLED,
  };

  it("writes the active span as a W3C traceparent and reads it back", () => {
    const active = trace.setSpanContext(context.active(), spanContext);

    const carrier = injectContext(active);
    expect(carrier).toEqual({
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    });

    const back = trace.getSpanContext(contextFromCarrier(carrier));
    expect(back).toMatchObject({
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      isRemote: true,
    });
  });

  it("accepts Kafka-style Map headers and missing carriers", () => {
    const headers = new Map([
      ["traceparent", "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"],
    ]);

    expect(trace.getSpanContext(contextFromCarrier(headers))?.traceId).toBe(spanContext.traceId);
    expect(trace.getSpanContext(contextFromCarrier(undefined))).toBeUndefined();
    expect(trace.getSpanContext(contextFromCarrier({ traceparent: "garbage" }))).toBeUndefined();
  });

  it("is empty when there is no active span", () => {
    expect(injectContext()).toEqual({});
  });
});
