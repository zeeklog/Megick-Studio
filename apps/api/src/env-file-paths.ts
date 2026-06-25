import { resolve } from "node:path";

export function apiEnvMode() {
  return process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
}

function envFileNames(mode: string) {
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function apiProjectRoot() {
  return resolve(__dirname, "..");
}

function repoRoot() {
  return resolve(apiProjectRoot(), "../..");
}

export function apiEnvFilePaths(mode = apiEnvMode()) {
  const roots = unique([apiProjectRoot(), process.cwd(), repoRoot()]);

  return roots.flatMap((root) => envFileNames(mode).map((fileName) => resolve(root, fileName)));
}
