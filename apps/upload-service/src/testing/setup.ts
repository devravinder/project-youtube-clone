import { Logger } from "@nestjs/common";

// Services log expected failures (for example a storage error in the cleanup test).
Logger.overrideLogger(false);
