import { LogLevel } from "../../config/config.types.js";

export type LogMetaValue = string | number | boolean | null | undefined;
export type LogMeta = Readonly<Record<string, LogMetaValue>>;

export interface Logger {
  child(bindings: LogMeta): Logger;
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
}
