import fs from "node:fs/promises";
import path from "node:path";
import express, { raw, type Router } from "express";
import { PlainResponse, sendPlainResponse } from "./plain-response";

export interface HandlerArgs {
  req: express.Request;
  res: express.Response;
}

export type RouteHandler = (args: HandlerArgs) => Promise<PlainResponse>;

interface FileRouteHandler {
  GET?: RouteHandler;
  POST?: RouteHandler;
}

type FileRoute = { filePath: string; routePath: string };

async function readRoutesFromFs(opts: {
  baseDir: string;
  currentDir?: string;
}): Promise<FileRoute[]> {
  const { baseDir, currentDir } = opts;
  const routes: FileRoute[] = [];

  const files = await fs.readdir(currentDir || baseDir);

  for (const file of files) {
    const fullFilePath = path.join(currentDir || baseDir, file);
    const stat = await fs.stat(fullFilePath);

    if (stat.isDirectory()) {
      const subRoutes = await readRoutesFromFs({
        baseDir,
        currentDir: fullFilePath,
      });
      routes.push(...subRoutes);
    } else if (stat.isFile() && file.endsWith(".tsx")) {
      const relativePath = path.relative(baseDir, fullFilePath);
      routes.push({ filePath: fullFilePath, routePath: relativePath });
    }
  }

  return routes;
}

export function expressifyFileRoutes(routes: FileRoute[]): FileRoute[] {
  return routes.map(({ filePath, routePath }) => {
    const expressRoutePath =
      "/" +
      routePath
        .replace(/\/index.tsx$/, "")
        .replace(/index.tsx$/, "")
        .replace(/\.tsx$/, "")
        .split("/")
        .map((part) => {
          if (part.startsWith("[...") && part.endsWith("]")) {
            return `:${part.slice(4, -1)}(*)`;
          }
          if (part.startsWith("[") && part.endsWith("]")) {
            return `:${part.slice(1, -1)}`;
          }
          return part;
        })
        .join("/");

    return { filePath, routePath: expressRoutePath };
  });
}

async function _fileRouter(routes: FileRoute[]): Promise<Router> {
  const router = express.Router();

  routes.forEach(async ({ filePath, routePath }) => {
    try {
      const module = (await import(filePath)) as { default: FileRouteHandler };
      if (module?.default?.GET) {
        if (typeof module.default.GET !== "function") {
          throw new Error(`GET export in route ${filePath} is not a function`);
        }
        router.get(routePath, async (req, res, next) => {
          try {
            const plainResponse = await module.default.GET!({ req, res });
            await sendPlainResponse(res, plainResponse);
          } catch (e) {
            next(e);
          }
        });
      }

      if (module?.default?.POST) {
        if (typeof module.default.POST !== "function") {
          throw new Error(`POST export in route ${filePath} is not a function`);
        }
        router.post(routePath, async (req, res, next) => {
          try {
            const plainResponse = await module.default.POST!({ req, res });
            await sendPlainResponse(res, plainResponse);
          } catch (e) {
            next(e);
          }
        });
      }

      if (!module.default.GET && !module.default.POST) {
        console.error(`No exported GET or POST functions found in ${filePath}`);
      }
    } catch (e) {
      console.error(e);
      throw new Error(
        `Double check the route at ${filePath}. Make sure to export a GET or POST function.`
      );
    }
  });
  return router;
}

export async function fileRouter(opts: { dir: string }): Promise<Router> {
  const dir = path.resolve(process.cwd(), opts.dir);
  const rawFileRoutes = await readRoutesFromFs({ baseDir: dir });
  const expressRoutes = expressifyFileRoutes(rawFileRoutes);
  return _fileRouter(expressRoutes);
}
