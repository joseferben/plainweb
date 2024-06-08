import express from "express";
import { admin, fileRouter, flyHeaders, redirectWWW } from "plainweb";
import compression from "compression";
import errorHandler from "errorhandler";
import morgan from "morgan";
import { env } from "~/app/config/env";
import basicAuth from "express-basic-auth";
import { connection, database } from "~/app/config/database";
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many requests, please try again in a few seconds",
});

const auth = basicAuth({
  users: {
    admin: env.ADMINER_PASSWORD,
  },
  challenge: true,
  realm: "Adminer",
});

function addDatabase(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  res.locals.database = database;
  next();
}

export async function http(): Promise<express.Application> {
  const app = express();
  if (env.NODE_ENV !== "production") app.use(morgan("dev"));
  if (env.NODE_ENV === "production") app.use(morgan("combined"));
  if (env.NODE_ENV === "development") app.use(errorHandler());
  if (env.NODE_ENV === "production") app.use(redirectWWW);
  if (env.NODE_ENV === "development")
    app.use("/public", express.static("public"));
  if (env.NODE_ENV === "development") app.use(limiter);

  app.use(flyHeaders);
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use("/admin", auth, await admin(connection));
  app.use(addDatabase);
  app.use(await fileRouter({ dir: "app/routes", verbose: 3 }));
  app.listen(env.PORT);
  return app;
}
