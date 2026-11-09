import { ConsoleLogger, type LogLevel } from "@nestjs/common";
// The logs API moved into @opentelemetry/api; the old api-logs package registers nothing the SDK sees.
import { context, logs, SeverityNumber } from "@opentelemetry/api";

const SEVERITY: Record<LogLevel, SeverityNumber> = {
  verbose: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/**
 * Nest's console logger, plus every line as an OTel log record. The record carries the active span,
 * so Grafana links a log line to its trace.
 */
export class OtelConsoleLogger extends ConsoleLogger {
  private readonly otel = logs.getLogger("nestjs");

  protected override printMessages(
    messages: unknown[],
    nestContext = "",
    logLevel: LogLevel = "log",
    writeStreamType?: "stdout" | "stderr",
    errorStack?: unknown,
    params?: Record<string, unknown>,
  ): void {
    super.printMessages(messages, nestContext, logLevel, writeStreamType, errorStack, params);
    for (const message of messages) {
      this.otel.emit({
        severityNumber: SEVERITY[logLevel],
        severityText: logLevel.toUpperCase(),
        body: message instanceof Error ? message.message : String(message),
        attributes: { "log.context": nestContext },
        context: context.active(),
      });
    }
  }
}
