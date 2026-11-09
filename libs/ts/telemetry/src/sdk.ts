import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { PrismaInstrumentation } from "@prisma/instrumentation";

const METRIC_INTERVAL_MS = 10_000;

/**
 * Traces, metrics and logs over OTLP/HTTP to OTEL_EXPORTER_OTLP_ENDPOINT (default localhost:4318).
 * Service name comes from OTEL_SERVICE_NAME; the exporters read the standard OTEL_* variables.
 */
export function startTelemetry(env: NodeJS.ProcessEnv = process.env): NodeSDK {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "deployment.environment.name": env["APP_ENV"] ?? "local",
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        exportIntervalMillis: METRIC_INTERVAL_MS,
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Thousands of noise spans per request; HTTP, pg, redis and amqplib say what matters.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
        "@opentelemetry/instrumentation-net": { enabled: false },
      }),
      new PrismaInstrumentation(),
    ],
  });
  sdk.start();
  // Flush what is buffered, so the last spans of a stopped service are not lost.
  const stop = () => void sdk.shutdown().catch(() => undefined);
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  return sdk;
}
