import express from "express";
import { fileRouter, flyHeaders, redirectWWW } from "plainweb";
import compression from "compression";
import errorHandler from "errorhandler";
import morgan from "morgan";
import { env } from "~/app/config/env";
import { database } from "~/app/config/database";
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many requests, please try again in a few seconds",
});

function addDatabase(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  res.locals.database = database;
  next();
}

export async function app(
  redirects: Record<string, string>
): Promise<express.Application> {
  const app = express();
  if (env.NODE_ENV !== "production") app.use(morgan("dev"));
  if (env.NODE_ENV === "production") app.use(morgan("combined"));
  if (env.NODE_ENV === "development") app.use(errorHandler());
  if (env.NODE_ENV === "production") app.use(redirectWWW);
  if (env.NODE_ENV === "development")
    app.use("/public", express.static("public"));
  if (env.NODE_ENV === "development") app.use(limiter);

  app.use((req, res, next) => {
    const target = redirects[req.path];
    if (target) {
      res.redirect(target);
    } else {
      next();
    }
  });

  app.use(flyHeaders);
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(addDatabase);
  app.use(await fileRouter({ dir: "app/routes", verbose: 3 }));
  return app;
}
