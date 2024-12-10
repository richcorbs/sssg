import { SRC } from "./config.ts";
import { copySync,ensureDir, existsSync } from "@std/fs";
import { join, resolve } from "@std/path";

export async function checkSrcSetup() {
  await ensureDir(SRC);
  await ensureDir(resolve(join(SRC, "assets")));
  await ensureDir(resolve(join(SRC, "layouts")));
  await ensureDir(resolve(join(SRC, "pages")));
  await ensureDir(resolve(join(SRC, "snippets")));
}

export function copyInitFiles() {
  if (existsSync(SRC)) Deno.removeSync(SRC, { recursive: true });
  copySync("init", SRC)
}