import express, { type Express } from "express";
import { fileRouter, flyHeaders } from "plainweb";
import slowDown from "express-slow-down";
import compression from "compression";
import errorHandler from "errorhandler";
import { env } from "~/app/env";
import morgan from "morgan";

const limiter = slowDown({
  windowMs: 60 * 1000,
  delayAfter: 60,
  delayMs: (hits) => hits * 100,
});

export async function http(): Promise<Express> {
  const app = express();
  if (env.NODE_ENV === "development") app.use(morgan("dev"));
  else app.use(morgan("combined"));
  if (env.NODE_ENV === "development") app.use(errorHandler());
  if (env.NODE_ENV === "production") app.use(limiter);
  app.use(flyHeaders);
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static("public"));
  app.use(await fileRouter({ dir: "app/routes", debug: true }));
  return app;
}