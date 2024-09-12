import * as path from "node:path";
import { cwd } from "node:process";
import { loadAndGetConfig } from "./config";
import { getLogger } from "./log";
import { getManifest } from "./manifest";
import { fileExists } from "./plainstack-fs";

const log = getLogger("seed");

export async function runSeed() {
  const config = await loadAndGetConfig();
  const appConfig = await getManifest({ config, cwd: cwd() });

  const seedPath = path.join(cwd(), config.paths.seed);

  if (!(await fileExists(seedPath))) {
    log.info("Seed file not found. Skipping seeding.");
    return;
  }

  try {
    const seedModule = await import(seedPath);

    if (typeof seedModule.seed !== "function") {
      throw new Error("Seed file does not export a seed function");
    }

    await seedModule.seed(appConfig.database);
    log.info("Seeding completed successfully.");
  } catch (error) {
    log.error("Error during seeding:", error);
    throw error;
  }
}
