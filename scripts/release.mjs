#!/usr/bin/env node
import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./packages/cli/package.json", "utf8"));
const v = pkg.version;

execSync(`git commit -m "chore: release v${v}"`, { stdio: "inherit" });
execSync(`git tag v${v}`, { stdio: "inherit" });
console.log(`Released v${v}`);
