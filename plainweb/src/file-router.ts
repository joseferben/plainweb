import fs from "node:fs/promises";
import path from "node:path";
import express, { type Router } from "express";
import { Handler, handleResponse } from "./handler";

interface FileRouteHandler {
  GET?: Handler;
  POST?: Handler;
}

export type FileRoute = { filePath: string; routePath: string };

export type LoadedFileRoute = {
  filePath: string;
  GET?: Handler;
  POST?: Handler;
};

async function readRoutesFromFs(opts: {
  baseDir: string;
  ignorePatterns?: string[];
  verbose?: number;
  currentDir?: string;
}): Promise<FileRoute[]> {
  const { baseDir, currentDir } = opts;
  const routes: FileRoute[] = [];

  let files: string[] = [];
  try {
    files = await fs.readdir(currentDir || baseDir);
  } catch (e) {
    console.error(`[router] Error reading directory: ${currentDir || baseDir}`);
    console.error(`[router] see the error below`);
    throw e;
  }

  for (const file of files) {
    const fullFilePath = path.join(currentDir || baseDir, file);
    const stat = await fs.stat(fullFilePath);

    if (stat.isDirectory()) {
      opts.verbose && console.log(`[router] Found directory: ${fullFilePath}`);
      const subRoutes = await readRoutesFromFs({
        baseDir,
        currentDir: fullFilePath,
      });
      routes.push(...subRoutes);
    } else if (stat.isFile() && file.endsWith(".tsx")) {
      const relativePath = path.relative(baseDir, fullFilePath);
      opts.verbose &&
        console.log(`[router] Discovered file route: ${relativePath}`);
      routes.push({ filePath: fullFilePath, routePath: relativePath });
    }
  }

  return routes;
}

async function loadFileRoutes(routes: FileRoute[]): Promise<LoadedFileRoute[]> {
  const loadedRoutes: LoadedFileRoute[] = [];

  for (const { filePath } of routes) {
    let loadedFileRoute: LoadedFileRoute | undefined;
    try {
      const module = (await import(filePath)) as { default: FileRouteHandler };
      if (module?.default?.GET) {
        if (typeof module.default.GET !== "function") {
          throw new Error(
            `[router] GET export in route ${filePath} is not a function`
          );
        }
        loadedFileRoute = { filePath, GET: module.default.GET };
      }

      if (module?.default?.POST) {
        if (typeof module.default.POST !== "function") {
          throw new Error(
            `[router] POST export in route ${filePath} is not a function`
          );
        }
        if (loadedFileRoute) {
          loadedFileRoute.POST = module.default.POST;
        } else {
          loadedFileRoute = { filePath, POST: module.default.POST };
        }
      }

      if (!loadedFileRoute) {
        console.error(
          `[router] No exported GET or POST functions found in ${filePath}`
        );
      } else {
        loadedRoutes.push(loadedFileRoute);
      }
    } catch (e) {
      console.error(e);
      throw new Error(
        `[router] Double check the route at ${filePath}. Make sure to export a GET or POST function.`
      );
    }
  }

  return loadedRoutes;
}

export function getExpressRoutePath({
  dir,
  filePath,
  verbose = 0,
}: {
  dir: string;
  filePath: string;
  verbose?: number;
}): string {
  if (filePath === `${dir}/index.tsx`) {
    return "/";
  }
  let relativeFilePath = filePath.replace(dir, "");
  if (!dir.startsWith("/")) {
    relativeFilePath = filePath.replace("/" + dir, "");
  }
  const expressPath = relativeFilePath
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
  verbose > 2 &&
    console.log(
      `[router] with dir ${dir} mapping ${relativeFilePath} -> ${expressPath}`
    );
  return expressPath;
}

export function expressRouter({
  loadedFileRoutes,
  dir,
  verbose = 0,
}: {
  loadedFileRoutes: LoadedFileRoute[];
  dir: string;
  verbose?: number;
}): Router {
  const router = express.Router();

  loadedFileRoutes.forEach((route) => {
    const routePath = getExpressRoutePath({
      dir,
      filePath: route.filePath,
      verbose,
    });
    if (route.GET) {
      router.get(routePath, async (req, res, next) => {
        try {
          const userResponse = await route.GET!({ req, res });
          await handleResponse(res, userResponse);
        } catch (e) {
          next(e);
        }
      });
    }
    if (route.POST) {
      router.post(routePath, async (req, res, next) => {
        try {
          const userResponse = await route.POST!({ req, res });
          await handleResponse(res, userResponse);
        } catch (e) {
          next(e);
        }
      });
    }
  });
  return router;
}

export type FileRouterOpts = {
  dir: string;
  ignorePatterns?: string[];
  fileRoutes?: FileRoute[];
  loadedFileRoutes?: LoadedFileRoute[];
  verbose?: number;
};

export async function fileRouter(opts: FileRouterOpts): Promise<Router> {
  const dir = path.resolve(process.cwd(), opts.dir);
  if (opts.loadedFileRoutes?.length) {
    return expressRouter({
      loadedFileRoutes: opts.loadedFileRoutes,
      dir,
      verbose: opts.verbose,
    });
  } else if (opts.fileRoutes?.length) {
    const loadedFileRoutes = await loadFileRoutes(opts.fileRoutes);
    return expressRouter({
      loadedFileRoutes: loadedFileRoutes,
      dir,
      verbose: opts.verbose,
    });
  } else {
    const fileRoutes = await readRoutesFromFs({
      baseDir: dir,
      ignorePatterns: opts.ignorePatterns,
      verbose: opts.verbose,
    });
    const loadedFileRoutes = await loadFileRoutes(fileRoutes);
    return expressRouter({ loadedFileRoutes, dir, verbose: opts.verbose });
  }
}
