import { metrics } from "@opentelemetry/api";

// No-ops unless the SDK was started by @yt/telemetry/register (local-observability).
const meter = metrics.getMeter("upload-service");

export const outboxPublished = meter.createCounter("yt.outbox.published", {
  description: "Outbox messages handed to a broker, by type and outcome (sent, failed, timed-out)",
});

export const viewsRecorded = meter.createCounter("yt.views.recorded", {
  description: "View requests, by outcome (counted, repeat, postgres, unconfirmed)",
});

export const viewsFlushed = meter.createCounter("yt.views.flushed", {
  description: "Views moved from Redis into Postgres",
});

export const outboxPendingGauge = () =>
  meter.createObservableGauge("yt.outbox.pending", {
    description: "Outbox rows not yet published (the relay's backlog)",
  });
