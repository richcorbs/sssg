import { DIST, SRC } from "./config.ts";
import { walk } from "@std/fs/walk";
import { existsSync } from "@std/fs/exists";
import { resolve } from "@std/path/resolve";
import { join } from "@std/path/join";
import { ensureDir } from "@std/fs/ensure-dir";
import { Asset, Layout, Page, Snippet } from "./types.ts";
import { mdConverter } from "@ptm/mm-mark";

const DEFAULT_LAYOUT_PATH = resolve(join(SRC, "layouts", "Default.html"));
const MD = mdConverter();

let ASSETS: { [key: string]: Asset };
let PAGES: { [key: string]: Page };
let LAYOUTS: { [key: string]: Layout };
let SNIPPETS: { [key: string]: Snippet };

export function initializeDist() {
  if (existsSync(DIST)) Deno.removeSync(DIST, { recursive: true });
  Deno.mkdirSync(DIST);
}

export async function buildDistStructure() {
  for await (const dirEntry of walk(SRC)) {
    if (!dirEntry.isDirectory) continue;
    if (dirEntry.path.includes(resolve(join(SRC, "layouts")))) continue;
    if (dirEntry.path.includes(resolve(join(SRC, "snippets")))) continue;
    let path = dirEntry.path;
    path = path.replace(/^src/, DIST);
    path = path.replace("/pages", "/");
    await ensureDir(path);
  }
}

export async function build() {
  console.log("Building...");
  initializeDist();
  await buildDistStructure();
  await initializeCache();
  await buildPages();
}

export async function buildPages() {
  // await initializeLayouts();
  // await initializeSnippets();
  for await (const dirEntry of walk(SRC)) {
    const fullDirEntryPath: string = resolve(join(dirEntry.path));
    if (dirEntry.isDirectory) continue;
    if (fullDirEntryPath.startsWith(resolve(join(SRC, "layouts")))) continue;
    if (fullDirEntryPath.startsWith(resolve(join(SRC, "snippets")))) continue;
    await buildPage(fullDirEntryPath);
  }
}

export async function buildPage(path: string) {
  // console.log("Building page:", path);
  if (!existsSync(path)) {
    console.log("OOOOOPS! Delete from dist:", path);
    return;
  }
  if (path.startsWith(resolve(join(SRC, "pages")))) {
    PAGES[path] = { dependencies: new Set() };
  }
  let wrappedPageText: string = "";
  let pageText = Deno.readTextFileSync(path);

  if (path.startsWith(resolve(join(SRC, "assets")))) {
    let newPath: string = path;
    newPath = newPath.replace(/\/src\//, "/" + DIST + "/");
    Deno.copyFileSync(path, newPath);
    return;
  }

  if (path.endsWith(".md")) {
    pageText = await MD.makeHtml(pageText);
  }

  for await (const layoutPath of Object.keys(LAYOUTS)) {
    const layoutTag1: string = `<${LAYOUTS[layoutPath].name}>`;
    const layoutTag2: string = `</${LAYOUTS[layoutPath].name}>`;
    if (
      pageText.match(new RegExp(`^${layoutTag1}`)) &&
      pageText.match(new RegExp(`${layoutTag2}\\s*$`))
    ) {
      const layoutText: string = Deno.readTextFileSync(layoutPath);
      wrappedPageText = layoutText.replace("<slot></slot>", pageText);
      wrappedPageText = wrappedPageText.replace(layoutTag1, "");
      wrappedPageText = wrappedPageText.replace(layoutTag2, "");
      LAYOUTS[layoutPath].dependents.add(path);
      PAGES[path].dependencies.add(layoutPath);
    }
  }

  if (wrappedPageText === "") {
    const layoutText: string = Deno.readTextFileSync(
      resolve(join(DEFAULT_LAYOUT_PATH)),
    );
    wrappedPageText = layoutText.replace("<slot></slot>", pageText);
    wrappedPageText = wrappedPageText.replace("<DefaultLayout>", "");
    wrappedPageText = wrappedPageText.replace("</DefaultLayout>", "");
    LAYOUTS[resolve(join(DEFAULT_LAYOUT_PATH))].dependents.add(path);
    PAGES[path].dependencies.add(resolve(join(DEFAULT_LAYOUT_PATH)));
  }

  for await (const snippetPath of Object.keys(SNIPPETS)) {
    const snippetTag1 = `<${SNIPPETS[snippetPath].name}></${
      SNIPPETS[snippetPath].name
    }>`;
    const snippetTag2 = `<${SNIPPETS[snippetPath].name}/>`;
    ``;
    const snippetTag3 = `<${SNIPPETS[snippetPath].name} />`;
    const snippetText = Deno.readTextFileSync(snippetPath);
    if (wrappedPageText.includes(snippetTag1)) {
      wrappedPageText = wrappedPageText.replace(snippetTag1, snippetText);
      SNIPPETS[snippetPath].dependents.add(path);
      PAGES[path].dependencies.add(snippetPath);
    }
    if (wrappedPageText.includes(snippetTag2)) {
      wrappedPageText = wrappedPageText.replace(snippetTag2, snippetText);
      SNIPPETS[snippetPath].dependents.add(path);
      PAGES[path].dependencies.add(snippetPath);
    }
    if (wrappedPageText.includes(snippetTag3)) {
      wrappedPageText = wrappedPageText.replace(snippetTag3, snippetText);
      SNIPPETS[snippetPath].dependents.add(path);
      PAGES[path].dependencies.add(snippetPath);
    }
  }

  let newPath: string = path;
  newPath = newPath.replace("/" + SRC + "/", "/" + DIST + "/");
  newPath = newPath.replace("/pages/", "/");
  newPath = newPath.replace(/.md$/, ".html");
  Deno.writeTextFileSync(newPath, wrappedPageText);
}

export async function initializeAssets() {
  ASSETS = {};
  for await (const a of walk(resolve(join(SRC, "assets")))) {
    if (a.isDirectory) continue;
    const newAsset: Asset = {
      dependents: new Set(),
    };
    ASSETS[a.path] = newAsset;
  }
}

export async function initializeCache() {
  await initializeAssets();
  await initializeLayouts();
  await initializeLayoutDependencies();
  await initializePages();
  await initializeSnippets();
  await initializeDependencies();
}

export async function initializeDependencies() {
  for await (const page of Object.keys(PAGES)) {
    await initializePageDependencies(page);
  }
}

export async function initializeLayouts() {
  LAYOUTS = {};
  for await (const l of walk(resolve(join(SRC, "layouts")))) {
    if (l.isDirectory) continue;
    const name = l.name.replace(".html", "") + "Layout";
    const newLayout: Layout = {
      name: name,
      dependents: new Set(),
    };
    LAYOUTS[l.path] = newLayout;
  }
}

export async function initializeLayoutDependencies() {
  for await (const layout of Object.keys(LAYOUTS)) {
    const text = await Deno.readTextFile(layout);
    for await (const asset of Object.keys(ASSETS)) {
      const newPath = asset.replace(SRC, "");
      if (text.includes(newPath)) {
        ASSETS[asset].dependents.add(layout);
      }
    }
  }
}

export async function initializePages() {
  PAGES = {};
  for await (const p of walk(resolve(join(SRC, "pages")))) {
    if (p.isDirectory) continue;
    const newPage: Page = {
      dependencies: new Set(),
    };
    PAGES[p.path] = newPage;
  }
}

export async function initializePageDependencies(page: string) {
  const text = await Deno.readTextFile(page);
  let hasLayout = false;

  // Assets
  for await (const asset of Object.keys(ASSETS)) {
    const newPath = asset.replace(SRC, "");
    if (text.includes(newPath)) {
      PAGES[page].dependencies.add(asset);
      ASSETS[asset].dependents.add(page);
    }
  }

  // Layouts
  for await (const layout of Object.keys(LAYOUTS)) {
    const layoutOpenTag = `<${LAYOUTS[layout].name}>`;
    const layoutCloseTag = `</${LAYOUTS[layout].name}>`;
    if (
      text.match(new RegExp(`^\\s*${layoutOpenTag}`)) &&
      text.match(new RegExp(`${layoutCloseTag}\\s*$`))
    ) {
      PAGES[page].dependencies.add(layout);
      LAYOUTS[layout].dependents.add(page);
      hasLayout = true;
      break;
    }
  }
  if (!hasLayout) {
    PAGES[page].dependencies.add(resolve(join(DEFAULT_LAYOUT_PATH)));
    LAYOUTS[DEFAULT_LAYOUT_PATH].dependents.add(page);
  }

  // Snippets
  for await (const snippet of Object.keys(SNIPPETS)) {
    const snippetTag1 = `<${SNIPPETS[snippet].name}></${
      SNIPPETS[snippet].name
    }>`;
    const snippetTag2 = `<${SNIPPETS[snippet].name} />`;
    const snippetTag3 = `<${SNIPPETS[snippet].name}/>`;
    if (
      text.includes(snippetTag1) ||
      text.includes(snippetTag2) ||
      text.includes(snippetTag3)
    ) {
      PAGES[page].dependencies.add(snippet);
      SNIPPETS[snippet].dependents.add(page);
      break;
    }
  }
}

export async function initializeSnippets() {
  SNIPPETS = {};
  for await (const s of walk(resolve(join(SRC, "snippets")))) {
    if (s.isDirectory) continue;
    const name = s.name.replace(".html", "");
    const newSnippet: Snippet = {
      name: name,
      dependents: new Set(),
    };
    SNIPPETS[s.path] = newSnippet;
  }
}

export async function handleAssetEvent(event: Deno.FsEvent) {
  if (event.kind === "create") {
    await buildPage(event.paths[0]);
  } else if (event.kind === "modify") {
    for await (const path of ASSETS[event.paths[0]].dependents) {
      await buildPage(path);
    }
  } else if (event.kind === "remove") {
    await build();
  } else if (event.kind === "rename") {
    await build();
  }
}

export async function handleLayoutEvent(event: Deno.FsEvent) {
  if (event.kind === "create") {
    await build();
  } else if (event.kind === "modify") {
    await build();
  } else if (event.kind === "remove") {
    await build();
  } else if (event.kind === "rename") {
    await build();
  }
}

export async function handlePageEvent(event: Deno.FsEvent) {
  if (event.kind === "create") {
    await build();
  } else if (event.kind === "modify") {
    await build();
  } else if (event.kind === "remove") {
    await build();
  } else if (event.kind === "rename") {
    await build();
  }
}

export async function handleSnippetEvent(event: Deno.FsEvent) {
  if (event.kind === "create") {
    await build();
  } else if (event.kind === "modify") {
    await build();
  } else if (event.kind === "remove") {
    await build();
  } else if (event.kind === "rename") {
    await build();
  }
}
