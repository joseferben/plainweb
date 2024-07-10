import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import arg from "arg";
import execa from "execa";
import fse from "fs-extra";
import semver from "semver";
import sortPackageJSON from "sort-package-json";
import stripAnsi from "strip-ansi";

import { confirm, input } from "@inquirer/prompts";
import { version as thisPlainwebVersion } from "../../plainweb/package.json";
import { CopyTemplateError, copyTemplate } from "./copy-template";
import { renderLoadingIndicator } from "./loading-indicator";
import {
  IGNORED_TEMPLATE_DIRECTORIES,
  color,
  debug,
  ensureDirectory,
  error,
  getDirectoryFilesRecursive,
  info,
  isInteractive,
  isValidJsonObject,
  log,
  sleep,
  strip,
  stripDirectoryFromPath,
  toValidProjectName,
} from "./utils";

async function getContext(argv: string[]): Promise<Context> {
  const flags = arg(
    {
      "--debug": Boolean,
      "--plainweb-version": String,
      "-v": "--plainweb-version",
      "--template": String,
      "--token": String,
      "--yes": Boolean,
      "-y": "--yes",
      "--install": Boolean,
      "--no-install": Boolean,
      "--package-manager": String,
      "--show-install-output": Boolean,
      "--init-script": Boolean,
      "--no-init-script": Boolean,
      "--git-init": Boolean,
      "--no-git-init": Boolean,
      "--help": Boolean,
      "-h": "--help",
      "--version": Boolean,
      "--V": "--version",
      "--no-color": Boolean,
      "--no-motion": Boolean,
      "--overwrite": Boolean,
    },
    { argv, permissive: true },
  );

  let {
    "--debug": debug = false,
    "--help": help = false,
    "--plainweb-version": selectedPlainwebVersion,
    "--template": template,
    "--token": token,
    "--install": install,
    "--no-install": noInstall,
    "--package-manager": pkgManager,
    "--show-install-output": showInstallOutput = false,
    "--git-init": git,
    "--no-init-script": noInitScript,
    "--init-script": initScript,
    "--no-git-init": noGit,
    "--no-motion": noMotion,
    "--yes": yes,
    "--version": versionRequested,
    "--overwrite": overwrite,
  } = flags;

  const cwd = flags._[0];
  const interactive = isInteractive();
  const projectName = cwd;

  if (!interactive) {
    yes = true;
  }

  if (selectedPlainwebVersion) {
    if (semver.valid(selectedPlainwebVersion)) {
      // do nothing, we're good
    } else if (semver.coerce(selectedPlainwebVersion)) {
      selectedPlainwebVersion = semver.coerce(selectedPlainwebVersion)?.version;
    } else {
      log(
        `\n${color.warning(
          `${selectedPlainwebVersion} is an invalid version specifier. Using Plainweb v${thisPlainwebVersion}.`,
        )}`,
      );
      selectedPlainwebVersion = undefined;
    }
  }

  const context: Context = {
    tempDir: path.join(
      await fs.promises.realpath(os.tmpdir()),
      `create-plainweb--${Math.random().toString(36).substr(2, 8)}`,
    ),
    cwd,
    overwrite,
    interactive,
    debug,
    git: git ?? (noGit ? false : yes),
    help,
    install: install ?? (noInstall ? false : yes),
    showInstallOutput,
    pkgManager: validatePackageManager(
      pkgManager ??
        // npm, pnpm, Yarn, and Bun set the user agent environment variable that can be used
        // to determine which package manager ran the command.
        (process.env.npm_config_user_agent ?? "npm").split("/")[0],
    ),
    projectName,
    plainwebVersion: selectedPlainwebVersion || thisPlainwebVersion,
    template: "joseferben/plainweb/template",
    versionRequested,
  };

  return context;
}

async function introStep(ctx: Context) {
  log(
    `\n${color.bgWhite(` ${color.black("plainweb")} `)}  ${color.green(
      color.bold(`v${ctx.plainwebVersion}`),
    )} ${color.bold("🪨  Let's build a plainweb app...")}`,
  );

  if (!ctx.interactive) {
    log("");
    info("Shell is not interactive.", [
      "Using default options. This is equivalent to running with the ",
      color.reset("--yes"),
      " flag.",
    ]);
  }
}

async function projectNameStep(ctx: Context) {
  // valid cwd is required if shell isn't interactive
  if (!ctx.interactive && !ctx.cwd) {
    error("Oh no!", "No project directory provided");
    throw new Error("No project directory provided");
  }

  if (ctx.cwd) {
    await sleep(100);
    info("Directory:", [
      "Using ",
      color.reset(ctx.cwd),
      " as project directory",
    ]);
  }

  if (!ctx.cwd) {
    const name = await input({
      message: "Where should we create your new project?",
      default: "./my-plainweb-project",
    });
    ctx.cwd = name;
    ctx.projectName = toValidProjectName(name);
    return;
  }

  let name = ctx.cwd;
  if (name === "." || name === "./") {
    const parts = process.cwd().split(path.sep);
    name = parts[parts.length - 1];
  } else if (name.startsWith("./") || name.startsWith("../")) {
    const parts = name.split("/");
    name = parts[parts.length - 1];
  }
  ctx.projectName = toValidProjectName(name);
}

async function copyTemplateToTempDirStep(ctx: Context) {
  const template = ctx.template;

  await loadingIndicator({
    start: "Template copying...",
    end: "Template copied",
    while: async () => {
      await ensureDirectory(ctx.tempDir);
      if (ctx.debug) {
        debug(`Extracting to: ${ctx.tempDir}`);
      }

      const result = await copyTemplate(template, ctx.tempDir, {
        debug: ctx.debug,
        async onError(err) {
          error(
            "Oh no!",
            err instanceof CopyTemplateError
              ? err.message
              : "Something went wrong. Run `create-plainweb --debug` to see more info.\n\n" +
                  "Open an issue to report the problem at " +
                  "https://github.com/joseferben/plainweb/issues/new",
          );
          throw err;
        },
        async log(message) {
          if (ctx.debug) {
            debug(message);
            await sleep(500);
          }
        },
      });

      if (result?.localTemplateDirectory) {
        ctx.tempDir = path.resolve(result.localTemplateDirectory);
      }
    },
    ctx,
  });
}

async function copyTempDirToAppDirStep(ctx: Context) {
  await ensureDirectory(ctx.cwd);

  const files1 = await getDirectoryFilesRecursive(ctx.tempDir);
  const files2 = await getDirectoryFilesRecursive(ctx.cwd);
  const collisions = files1
    .filter((f) => files2.includes(f))
    .sort((a, b) => a.localeCompare(b));

  if (collisions.length > 0) {
    const getFileList = (prefix: string) => {
      const moreFiles = collisions.length - 5;
      const lines = ["", ...collisions.slice(0, 5)];
      if (moreFiles > 0) {
        lines.push(`and ${moreFiles} more...`);
      }
      return lines.join(`\n${prefix}`);
    };

    if (ctx.overwrite) {
      info(
        "Overwrite:",
        `overwriting files due to \`--overwrite\`:${getFileList("           ")}`,
      );
    } else if (!ctx.interactive) {
      error(
        "Oh no!",
        `Destination directory contains files that would be overwritten
              and no \`--overwrite\` flag was included in a non-interactive
              environment. The following files would be overwritten:
        ${getFileList("           ")}`,
      );
      throw new Error(
        "File collisions detected in a non-interactive environment",
      );
    } else {
      if (ctx.debug) {
        debug(`Colliding files:${getFileList("          ")}`);
      }

      const overwrite = await confirm({
        message: `Your project directory contains files that will be overwritten by
                       this template (you can force with \`--overwrite\`)
                       Files that would be overwritten:
          ${getFileList("               ")}
                       Do you wish to continue?`,
        default: false,
      });
      if (!overwrite) {
        throw new Error("Exiting to avoid overwriting files");
      }
    }
  }

  await fse.copy(ctx.tempDir, ctx.cwd, {
    filter(src, dest) {
      // We never copy .git/ or node_modules/ directories since it's highly
      // unlikely we want them copied - and because templates are primarily
      // being pulled from git tarballs which won't have .git/ and shouldn't
      // have node_modules/
      const file = stripDirectoryFromPath(ctx.tempDir, src);
      const isIgnored = IGNORED_TEMPLATE_DIRECTORIES.includes(file);
      if (isIgnored) {
        if (ctx.debug) {
          debug(`Skipping copy of ${file} directory from template`);
        }
        return false;
      }
      return true;
    },
  });

  await updatePackageJSON(ctx);
}

async function installDependenciesQuestionStep(ctx: Context) {
  if (ctx.install === undefined) {
    const deps = await confirm({
      message: `Install dependencies with ${ctx.pkgManager}?`,
      default: true,
    });
    ctx.install = deps;
  }
}

async function installDependenciesStep(ctx: Context) {
  const { install, pkgManager, showInstallOutput, cwd } = ctx;

  if (!install) {
    await sleep(100);
    info("Skipping install step.", [
      "Remember to install dependencies after setup with ",
      color.reset(`${pkgManager} install`),
      ".",
    ]);
    return;
  }

  function runInstall() {
    return installDependencies({
      cwd,
      pkgManager,
      showInstallOutput,
    });
  }

  if (showInstallOutput) {
    log("");
    info("Install", `Dependencies installing with ${pkgManager}...`);
    log("");
    await runInstall();
    log("");
    return;
  }

  log("");
  await loadingIndicator({
    start: `Dependencies installing with ${pkgManager}...`,
    end: "Dependencies installed",
    while: runInstall,
    ctx,
  });
}

async function gitInitQuestionStep(ctx: Context) {
  if (fs.existsSync(path.join(ctx.cwd, ".git"))) {
    info("Nice!", "Git has already been initialized");
    return;
  }

  let git = ctx.git;
  if (ctx.git === undefined) {
    git = await confirm({
      message: "Initialize a new git repository?",
      default: true,
    });
  }

  ctx.git = git ?? false;
}

async function gitInitStep(ctx: Context) {
  if (!ctx.git) {
    return;
  }

  if (fs.existsSync(path.join(ctx.cwd, ".git"))) {
    log("");
    info("Nice!", "Git has already been initialized");
    return;
  }

  log("");
  await loadingIndicator({
    start: "Git initializing...",
    end: "Git initialized",
    while: async () => {
      const options = { cwd: ctx.cwd, stdio: "ignore" } as const;
      const commitMsg = "Initial commit from create-plainweb";
      try {
        await execa("git", ["init"], options);
        await execa("git", ["add", "."], options);
        await execa("git", ["commit", "-m", commitMsg], options);
      } catch (err) {
        error("Oh no!", "Failed to initialize git.");
        throw err;
      }
    },
    ctx,
  });
}

async function createEnvStep(ctx: Context) {
  const envPath = path.join(ctx.cwd, ".env");
  if (fs.existsSync(envPath)) {
    log("");
    info("Nice!", "An .env file already exists");
    return;
  }

  log("");
  await loadingIndicator({
    start: "Creating .env file...",
    end: ".env file created",
    while: async () => {
      await fs.promises.writeFile(envPath, "NODE_ENV=development", "utf-8");
    },
    ctx,
  });
}

async function doneStep(ctx: Context) {
  const projectDir = path.relative(process.cwd(), ctx.cwd);

  const max = process.stdout.columns;
  const prefix = max < 80 ? " " : " ".repeat(9);
  await sleep(200);

  log(`\n ${color.bgWhite(color.black(" done "))}  That's it!`);
  await sleep(100);
  if (projectDir !== "") {
    const enter = [
      `\n${prefix}Enter your project directory using`,
      color.cyan(`cd .${path.sep}${projectDir}`),
    ];
    const len = enter[0].length + stripAnsi(enter[1]).length;
    log(enter.join(len > max ? `\n${prefix}` : " "));
  }
  log(
    `${prefix}Check out ${color.bold(
      "README.md",
    )} for development and deploy instructions.`,
  );
}

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

const packageManagerExecScript: Record<PackageManager, string> = {
  npm: "npx",
  yarn: "yarn",
  pnpm: "pnpm exec",
  bun: "bunx",
};

function validatePackageManager(pkgManager: string): PackageManager {
  // biome-ignore lint/suspicious/noPrototypeBuiltins: <explanation>
  return packageManagerExecScript.hasOwnProperty(pkgManager)
    ? (pkgManager as PackageManager)
    : "npm";
}

async function installDependencies({
  pkgManager,
  cwd,
  showInstallOutput,
}: {
  pkgManager: PackageManager;
  cwd: string;
  showInstallOutput: boolean;
}) {
  try {
    await execa(pkgManager, ["install"], {
      cwd,
      stdio: showInstallOutput ? "inherit" : "ignore",
    });
  } catch (err) {
    error("Oh no!", "Failed to install dependencies.");
    throw err;
  }
}

async function updatePackageJSON(ctx: Context) {
  const packageJSONPath = path.join(ctx.cwd, "package.json");
  if (!fs.existsSync(packageJSONPath)) {
    const relativePath = path.relative(process.cwd(), ctx.cwd);
    error(
      "Oh no!",
      `The provided template must be a Plainweb project with a \`package.json\`
        file, but that file does not exist in ${color.bold(relativePath)}.`,
    );
    throw new Error(`package.json does not exist in ${ctx.cwd}`);
  }

  const contents = await fs.promises.readFile(packageJSONPath, "utf-8");
  let packageJSON: unknown;
  try {
    packageJSON = JSON.parse(contents);
    if (!isValidJsonObject(packageJSON)) {
      throw Error();
    }
  } catch (err) {
    error(
      "Oh no!",
      "The provided template must be a Plainweb project with a `package.json` " +
        "file, but that file is invalid.",
    );
    throw err;
  }

  for (const pkgKey of ["dependencies", "devDependencies"] as const) {
    const dependencies = packageJSON[pkgKey];
    if (!dependencies) continue;

    if (!isValidJsonObject(dependencies)) {
      error(
        "Oh no!",
        `The provided template must be a Plainweb project with a \`package.json\`
          file, but its ${pkgKey} value is invalid.`,
      );
      throw new Error(`package.json ${pkgKey} are invalid`);
    }

    for (const dependency in dependencies) {
      const version = dependencies[dependency];
      if (dependency === "plainweb") {
        dependencies[dependency] = semver.prerelease(ctx.plainwebVersion)
          ? // Templates created from prereleases should pin to a specific version
            ctx.plainwebVersion
          : `^${ctx.plainwebVersion}`;
      }
    }
  }

  packageJSON.name = ctx.projectName;

  fs.promises.writeFile(
    packageJSONPath,
    JSON.stringify(sortPackageJSON(packageJSON), null, 2),
    "utf-8",
  );
}

async function loadingIndicator(args: {
  start: string;
  end: string;
  while: (...args: unknown[]) => Promise<unknown>;
  ctx: Context;
}) {
  const { ctx, ...rest } = args;
  await renderLoadingIndicator({
    ...rest,
  });
}

function title(text: string) {
  return `${align(color.bgWhite(` ${color.black(text)} `), "end", 7)} `;
}

function printHelp(ctx: Context) {
  // prettier-ignore
  const output = `
${title("create-plainweb")}

${color.heading("Usage")}:

${color.dim("$")} ${color.greenBright("create-plainweb")} ${color.arg("<projectDir>")} ${color.arg("<...options>")}

${color.heading("Values")}:

${color.arg("projectDir")}          ${color.dim("The Plainweb project directory")}

${color.heading("Options")}:

${color.arg("--help, -h")}          ${color.dim("Print this help message and exit")}
${color.arg("--version, -V")}       ${color.dim("Print the CLI version and exit")}
${color.arg("--no-color")}          ${color.dim("Disable ANSI colors in console output")}

${color.arg("--template <name>")}   ${color.dim("The project template to use")}
${color.arg("--[no-]install")}      ${color.dim("Whether or not to install dependencies after creation")}
${color.arg("--package-manager")}   ${color.dim("The package manager to use")}
${color.arg("--show-install-output")}   ${color.dim("Whether to show the output of the install process")}
${color.arg("--[no-]git-init")}     ${color.dim("Whether or not to initialize a Git repository")}
${color.arg("--yes, -y")}           ${color.dim("Skip all option prompts and run setup")}
${color.arg("--plainweb-version, -v")}     ${color.dim("The version of Plainweb to use")}

${color.heading("Creating a new project")}:

Plainweb projects are created from the template. 
`;

  log(output);
}

function align(text: string, dir: "start" | "end" | "center", len: number) {
  const pad = Math.max(len - strip(text).length, 0);
  switch (dir) {
    case "start":
      return text + " ".repeat(pad);
    case "end":
      return " ".repeat(pad) + text;
    case "center":
      return (
        " ".repeat(Math.floor(pad / 2)) + text + " ".repeat(Math.floor(pad / 2))
      );
    default:
      return text;
  }
}

export async function createPlainweb(argv: string[]) {
  const ctx = await getContext(argv);
  if (ctx.help) {
    printHelp(ctx);
    return;
  }
  if (ctx.versionRequested) {
    log(thisPlainwebVersion);
    return;
  }

  const steps = [
    introStep,
    projectNameStep,
    copyTemplateToTempDirStep,
    copyTempDirToAppDirStep,
    gitInitQuestionStep,
    installDependenciesQuestionStep,
    installDependenciesStep,
    gitInitStep,
    createEnvStep,
    doneStep,
  ];

  try {
    for (const step of steps) {
      await step(ctx);
    }
  } catch (err) {
    if (ctx.debug) {
      console.error(err);
    }
    throw err;
  }
}

export interface Context {
  tempDir: string;
  cwd: string;
  interactive: boolean;
  debug: boolean;
  git?: boolean;
  help: boolean;
  install?: boolean;
  showInstallOutput: boolean;
  pkgManager: PackageManager;
  projectName?: string;
  plainwebVersion: string;
  stdin?: typeof process.stdin;
  stdout?: typeof process.stdout;
  template: "joseferben/plainweb/template";
  versionRequested?: boolean;
  overwrite?: boolean;
}
