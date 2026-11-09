// Telemetry is on in the local-observability environment, or when forced with OTEL_ENABLED=true.
export function telemetryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env["OTEL_ENABLED"] === "false" || env["OTEL_SDK_DISABLED"] === "true") return false;
  return env["OTEL_ENABLED"] === "true" || env["APP_ENV"] === "local-observability";
}
