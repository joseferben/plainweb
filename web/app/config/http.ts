import { database } from "app/config/database";
import { env } from "app/config/env";
import compression from "compression";
import errorHandler from "errorhandler";
import express from "express";
import basicAuth from "express-basic-auth";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { fileRouter, flyHeaders, redirectWWW, unstable_admin } from "plainweb";

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  message: "Too many requests, please try again in a few seconds",
});

// TODO move to plainweb
function addDatabase(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  res.locals.database = database;
  next();
}

// TOOD move to plainweb
function addRedirects(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const target = redirects[req.path];
  if (target) {
    res.redirect(target);
  } else {
    next();
  }
}

const redirects: Record<string, string> = {
  "/docs/environmet-variables": "/docs/environment-variables",
  "/docs": "/docs/getting-started",
};

export async function app(): Promise<express.Express> {
  const app = express();
  if (env.NODE_ENV !== "production") app.use(morgan("dev"));
  if (env.NODE_ENV === "production") app.use(morgan("combined"));
  if (env.NODE_ENV === "development") app.use(errorHandler());
  if (env.NODE_ENV === "production") app.use(redirectWWW);
  if (env.NODE_ENV === "development")
    app.use("/public", express.static("public"));
  if (env.NODE_ENV === "development") app.use(limiter);

  app.use(addRedirects);
  app.use(flyHeaders);
  app.use(compression());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(addDatabase);
  app.use("/_", (req, res, next) => {
    console.log("Before basicAuth middleware");
    next();
  });
  app.use(
    "/_",
    basicAuth({
      users: { admin: env.ADMIN_PASSWORD },
      challenge: true,
      unauthorizedResponse: () => {
        console.error("Unauthorized access to admin!");
      },
    }),
    await unstable_admin({ database, path: "/_" }),
  );
  app.use(await fileRouter({ dir: "app/routes", verbose: 3 }));
  return app;
}
