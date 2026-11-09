// Load with `--import @yt/telemetry/register`, before the app, so instrumentation can patch modules
// as they are first loaded. Off unless telemetryEnabled(): the plain local run pays nothing.
import { telemetryEnabled } from "./enabled.js";

if (telemetryEnabled()) {
  // ESM imports bypass require(); this loader hook lets instrumentations patch them too.
  const { register, supportsSyncHooks } = await import("import-in-the-middle/register-hooks.mjs");
  if (supportsSyncHooks()) {
    register(); // in-thread module.registerHooks (Node >= 22.22.3 / 24.11.1 / 26)
  } else {
    const { register: registerAsync } = await import("node:module");
    registerAsync("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
  }
  const { startTelemetry } = await import("./sdk.js");
  startTelemetry();
}
