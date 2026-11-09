import { Logger } from "@nestjs/common";

// Silence expected service error logs in tests.
Logger.overrideLogger(false);
