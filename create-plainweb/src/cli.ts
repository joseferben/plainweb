#!/usr/bin/env node
import process from "node:process";

import { createPlainweb } from "./create-plainweb";

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

const argv = process.argv.slice(2).filter((arg) => arg !== "--");

createPlainweb(argv).then(
  () => process.exit(0),
  () => process.exit(1),
);
