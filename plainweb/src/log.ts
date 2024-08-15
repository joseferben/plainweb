import { type Config, defaultConfigLogger, expandedConfig } from "config";
import winston from "winston";

const LABEL_MAX_LENGTH = 12;

function getLabel(info: winston.Logform.TransformableInfo) {
  let label = "";
  if (info.name && typeof info.name === "string") label = info.name;
  if (label.length > LABEL_MAX_LENGTH)
    return `${label.slice(0, LABEL_MAX_LENGTH - 2)}..`;
  return label;
}

const printFormat = winston.format.printf((info) => {
  return `[${info.timestamp}] ${getLabel(info)} ${info.level}: ${info.message}`;
});

const paddingFormat = winston.format((info) => {
  const label = getLabel(info);
  const paddingLevel = Math.max(LABEL_MAX_LENGTH - label.length, 0);
  const spacesLevel = " ".repeat(paddingLevel);
  info.level = `${spacesLevel}${info.level}`;

  return info;
})();

const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.errors({ stack: true }),
  winston.format.timestamp({
    format: "hh:mm:ss.SSS A",
  }),
  paddingFormat,
  printFormat,
);

function getProdLogger(logger: Config["logger"], name?: string) {
  return winston.createLogger({
    level: logger.level,
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.timestamp({
        format: "YYYY-MM-DD hh:mm:ss.SSS A",
      }),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
      }),
      ...logger.transports,
    ],
    defaultMeta: { name: name },
  });
}

function getDevLogger(logger: Pick<Config["logger"], "level">, name?: string) {
  return winston.createLogger({
    level: logger.level,
    format: consoleFormat,
    transports: [new winston.transports.Console()],
    defaultMeta: { name: name },
  });
}

/** Return a logger instances with an optional name. Return a prod logger if NODE_ENV=production, otherwise return a dev logger. */
export function getLogger(name?: string) {
  const { nodeEnv, logger } = expandedConfig || {
    nodeEnv: "development",
    logger: defaultConfigLogger,
  };
  if (logger?.logger) return logger.logger;
  return nodeEnv === "production"
    ? getProdLogger(logger, name)
    : getDevLogger(logger, name);
}

/** A pre-configured logger instance with the name "app". */
export const log = getLogger("app");