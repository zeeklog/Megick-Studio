const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const dotenv = require("dotenv");

function mode(env = process.env) {
  return env.APP_ENV || env.NODE_ENV || "development";
}

function envFileNames(currentMode) {
  return [".env", ".env.local", `.env.${currentMode}`, `.env.${currentMode}.local`];
}

function unique(values) {
  return [...new Set(values)];
}

function loadEnvFile(filePath, target) {
  if (!existsSync(filePath)) return;
  const parsed = dotenv.parse(readFileSync(filePath));
  Object.assign(target, parsed);
}

const apiRoot = resolve(__dirname, "..");
const repoRoot = resolve(apiRoot, "../..");
const roots = unique([repoRoot, apiRoot]);
const shellEnvKeys = new Set(Object.keys(process.env));
const selectedMode = mode();
const fileEnv = {};

for (const root of roots) {
  for (const fileName of envFileNames(selectedMode)) {
    loadEnvFile(resolve(root, fileName), fileEnv);
  }
}

for (const [key, value] of Object.entries(fileEnv)) {
  if (!shellEnvKeys.has(key)) {
    process.env[key] = value;
  }
}
