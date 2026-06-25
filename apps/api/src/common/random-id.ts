import { randomBytes } from "node:crypto";

export function randomId(size = 21) {
  return randomBytes(size).toString("base64url").slice(0, size);
}
