import { SRC } from "./main.ts";
import { ensureDir } from "@std/fs";
import { join, resolve } from "@std/path";

export async function checkSrcSetup() {
  await ensureDir(SRC);
  await ensureDir(resolve(join(SRC, "assets")));
  await ensureDir(resolve(join(SRC, "layouts")));
  await ensureDir(resolve(join(SRC, "pages")));
  await ensureDir(resolve(join(SRC, "snippets")));
}
