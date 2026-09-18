import { LogLevel } from "../../config/config.types.js";
import { Logger, LogMeta } from "./logger.port.js";

const LOG_PRIORITIES: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class ConsoleLogger implements Logger {
  constructor(
    private readonly minLevel: LogLevel = "info",
    private readonly bindings: LogMeta = {}
  ) {}

  child(bindings: LogMeta): Logger {
    return new ConsoleLogger(this.minLevel, { ...this.bindings, ...bindings });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_PRIORITIES[level] >= LOG_PRIORITIES[this.minLevel];
  }

  private format(level: LogLevel, msg: string, meta?: LogMeta): string {
    const timestamp = new Date().toISOString();
    const merged = { ...this.bindings, ...(meta || {}) };
    const metaStr = Object.keys(merged).length > 0 ? ` ${JSON.stringify(merged)}` : "";
    return `[${timestamp}] [${level.toUpperCase()}] ${msg}${metaStr}`;
  }

  debug(msg: string, meta?: LogMeta): void {
    if (this.shouldLog("debug")) {
      console.debug(this.format("debug", msg, meta));
    }
  }

  info(msg: string, meta?: LogMeta): void {
    if (this.shouldLog("info")) {
      console.info(this.format("info", msg, meta));
    }
  }

  warn(msg: string, meta?: LogMeta): void {
    if (this.shouldLog("warn")) {
      console.warn(this.format("warn", msg, meta));
    }
  }

  error(msg: string, meta?: LogMeta): void {
    if (this.shouldLog("error")) {
      console.error(this.format("error", msg, meta));
    }
  }
}
