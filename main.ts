import { parseArgs } from "@std/cli/parse-args";
import { walk } from "@std/fs/walk";
import { exists, existsSync } from "@std/fs/exists";
import { mdConverter } from "@ptm/mm-mark";
import { relative } from "@std/path";
import { zip } from "./zip.ts";

const SRC = "src";
const DIST = "dist";
const DEFAULT_LAYOUT_PATH = SRC + "/layouts/Default.html";
const MD = mdConverter();
const SSE_CONTROLLERS: Set<ReadableStreamDefaultController> = new Set();

type Asset = {
  dependents: Set<string>;
};

type Layout = {
  name: string;
  dependents: Set<string>;
};

type Page = {
  dependencies: Set<string>;
};

type Snippet = {
  name: string;
  dependents: Set<string>;
};

let ASSETS: { [key: string]: Asset };
let PAGES: { [key: string]: Page };
let LAYOUTS: { [key: string]: Layout };
let SNIPPETS: { [key: string]: Snippet };

async function main(): Promise<void> {
  const flags = parseArgs(Deno.args);
  console.log({ flags });

  checkSrcSetup();

  if (flags.build) await build();
  else if (flags.dev) {
    await build();
    await watch();
    serve();
  } else if (flags.register) {
    await register(flags.domain);
  } else if (flags.deploy) {
    await build();
    await deploy(flags.staging, flags.production);
  }
}

function checkDirectory(dir: string) {
  try {
    Deno.lstatSync(dir);
  } catch {
    Deno.mkdirSync(dir, { recursive: true });
  }
}

function checkSrcSetup() {
  checkDirectory(SRC);
  checkDirectory(SRC + "/assets");
  checkDirectory(SRC + "/layouts");
  checkDirectory(SRC + "/pages");
  checkDirectory(SRC + "/snippets");
}

async function build() {
  initializeDist();
  await buildDistStructure();
  await initializeCache();
  await buildPages();
}

async function buildDistStructure() {
  for await (const dirEntry of walk(SRC)) {
    if (!dirEntry.isDirectory) continue;
    if (dirEntry.path.includes(SRC + "/layouts")) continue;
    if (dirEntry.path.includes(SRC + "/snippets")) continue;
    let path = dirEntry.path;
    path = path.replace(/^src\//, DIST + "/");
    path = path.replace("/pages", "/");
    checkDirectory(path);
  }
}

async function buildPages() {
  await initializeLayouts();
  await initializeSnippets();
  for await (const dirEntry of walk(SRC)) {
    if (dirEntry.isDirectory) continue;
    if (dirEntry.path.includes(SRC + "/layouts")) continue;
    if (dirEntry.path.includes(SRC + "/snippets")) continue;
    await buildPage(dirEntry.path);
  }
}

async function buildPage(path: string) {
  console.log("Building page:", path);
  try {
    await Deno.lstat(path);
  } catch {
    console.log("OOOOOPS! Delete from dist:", path);
    return;
  }
  if (path.startsWith(SRC + "/pages")) {
    PAGES[path] = { dependencies: new Set() };
  }
  let wrappedPageText: string = "";
  let pageText = Deno.readTextFileSync(path);

  if (path.startsWith(SRC + "/assets")) {
    let newPath: string = path;
    newPath = newPath.replace(/^src\//, DIST + "/");
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
    const layoutText: string = Deno.readTextFileSync(DEFAULT_LAYOUT_PATH);
    wrappedPageText = layoutText.replace("<slot></slot>", pageText);
    wrappedPageText = wrappedPageText.replace("<DefaultLayout>", "");
    wrappedPageText = wrappedPageText.replace("</DefaultLayout>", "");
    LAYOUTS[DEFAULT_LAYOUT_PATH].dependents.add(path);
    PAGES[path].dependencies.add(DEFAULT_LAYOUT_PATH);
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
  newPath = newPath.replace(/^src\//, DIST + "/");
  newPath = newPath.replace("/pages/", "/");
  newPath = newPath.replace(/.md$/, ".html");
  Deno.writeTextFileSync(newPath, wrappedPageText);
}

async function register(domain: string) {
  if (!existsSync("./.sssg.json")) Deno.writeTextFileSync("./.sssg.json", "{}");
  const rawConfig = Deno.readTextFileSync("./.sssg.json");
  const config = JSON.parse(rawConfig);
  if (config.token && config.productionDomain) {
    console.log(
      "You have already registered a domain:",
      config.productionDomain,
    );
    Deno.exit(1);
  }
  if (!domain) {
    console.log("You must specify a domain");
    Deno.exit(1);
  }
  const registrationResponse: Response = await fetch(
    "http://domains.local:8000/api/register?domain=" + domain,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );

  if (registrationResponse.status === 200) {
    const json = await registrationResponse.json();
    config.token = json.token;
    config.stagingDomain = json.stagingDomain;
    config.productionDomain = json.productionDomain;
    Deno.writeTextFileSync("./.sssg.json", JSON.stringify(config));
    console.log("Domain registered successfully:", json.productionDomain);
  }
}

async function deploy(staging: boolean, production: boolean,) {
  if (!existsSync("./.sssg.json")) {
    console.log("You must register a domain first");
    Deno.exit(1);
  }
  const rawConfig = Deno.readTextFileSync("./.sssg.json");
  const config = JSON.parse(rawConfig);

  if (!config.token) {
    const registrationResponse: Response = await fetch(
      "http://domains.local:8000/api/register",
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    if (registrationResponse.status === 200) {
      const json = await registrationResponse.json();
      config.token = json.token;
      config.stagingDomain = json.stagingDomain;
      config.productionDomain = "";
      Deno.writeTextFileSync("./.sssg.json", JSON.stringify(config));
    }
  }

  let deployDomain: string = "";

  if (staging && production) {
    console.log("You can't deploy to both staging and production");
    Deno.exit(1);
  } else if (staging) {
    deployDomain = config.stagingDomain;
  } else if (production) {
    deployDomain = config.productionDomain;
  } else {
    deployDomain = config.stagingDomain;
  }

  if (
    production && deployDomain &&
    config.productionDomain !== "" &&
    deployDomain !== config.productionDomain
  ) {
    console.log(
      "You can't deploy to a different production domain than the one you registered with",
    );
    Deno.exit(1);
  }

  const zipFilename = `${deployDomain}.tgz`;
  await zip(DIST, zipFilename);
  const f = await Deno.readFile(zipFilename);
  const uploadFile = new File([f], zipFilename);
  const form = new FormData();
  form.append("file", uploadFile);
  form.append("token", config.token);
  form.append("domain", deployDomain);
  const response = await fetch("http://domains.local:8000/api/domain/upload", {
    method: "POST",
    body: form,
  });
  console.log("response", response);
  if (existsSync(zipFilename)) {
    await Deno.remove(zipFilename, { recursive: true });
  }
}

async function handleAssetEvent(event: Deno.FsEvent) {
  const relativePath = relative(Deno.cwd(), event.paths[0]);
  console.log(">>>>> Relative path:", relativePath);
  if (event.kind === "create") {
    await buildPage(relativePath);
  } else if (event.kind === "modify") {
    for await (const path of SNIPPETS[relativePath].dependents) {
      await buildPage(path);
    }
  } else if (event.kind === "remove") {
    await build();
  } else if (event.kind === "rename") {
    await build();
  }
}

async function handleLayoutEvent(event: Deno.FsEvent) {
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

async function handlePageEvent(event: Deno.FsEvent) {
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

async function handleSnippetEvent(event: Deno.FsEvent) {
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

async function initializeAssets() {
  ASSETS = {};
  for await (const a of walk(SRC + "/assets")) {
    if (a.isDirectory) continue;
    const newAsset: Asset = {
      dependents: new Set(),
    };
    ASSETS[a.path] = newAsset;
  }
}

async function initializeCache() {
  await initializeAssets();
  await initializeLayouts();
  await initializeLayoutDependencies();
  await initializePages();
  await initializeSnippets();
  await initializeDependencies();
}

async function initializeDependencies() {
  for await (const page of Object.keys(PAGES)) {
    console.log("Page:", page);
    await initializePageDependencies(page);
  }
}

function initializeDist() {
  try {
    Deno.lstatSync(DIST);
    Deno.removeSync(DIST, { recursive: true });
    Deno.mkdirSync(DIST);
  } catch {
    Deno.mkdirSync(DIST);
  }
}

async function initializeLayouts() {
  LAYOUTS = {};
  for await (const l of walk(SRC + "/layouts")) {
    if (l.isDirectory) continue;
    const name = l.name.replace(".html", "") + "Layout";
    const newLayout: Layout = {
      name: name,
      dependents: new Set(),
    };
    LAYOUTS[l.path] = newLayout;
  }
}

async function initializeLayoutDependencies() {
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

async function initializePages() {
  PAGES = {};
  for await (const p of walk(SRC + "/pages")) {
    if (p.isDirectory) continue;
    const newPage: Page = {
      dependencies: new Set(),
    };
    PAGES[p.path] = newPage;
  }
}

async function initializePageDependencies(page: string) {
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
    PAGES[page].dependencies.add(DEFAULT_LAYOUT_PATH);
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
async function initializeSnippets() {
  SNIPPETS = {};
  for await (const s of walk(SRC + "/snippets")) {
    if (s.isDirectory) continue;
    const name = s.name.replace(".html", "");
    const newSnippet: Snippet = {
      name: name,
      dependents: new Set(),
    };
    SNIPPETS[s.path] = newSnippet;
  }
}

function serve() {
  Deno.serve(async (req) => {
    const url = new URL(req.url);
    // console.log(req.method.toUpperCase(), url.pathname);

    let content: string;
    let contentType: string;

    if (url.pathname === "/sssg-hot-reload") {
      const body = new ReadableStream({
        start(controller) {
          SSE_CONTROLLERS.add(controller);
          controller.enqueue(new TextEncoder().encode("data: Hello, World!"));
        },
      });
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
          "transfer-encoding": "chunked",
        },
      });
    } else if (
      (await exists(DIST + url.pathname)) &&
      !url.pathname.endsWith("/")
    ) {
      content = await Deno.readTextFile(DIST + url.pathname);
      contentType = serveContentType(url.pathname);

      if (contentType === "text/html") content = serveInjectSSE(content);

      return new Response(content, {
        status: 200,
        headers: {
          "content-type": contentType,
        },
      });
    } else if (
      url.pathname.endsWith("/") &&
      (await exists(DIST + url.pathname + "index.html"))
    ) {
      content = await Deno.readTextFile(DIST + url.pathname + "index.html");
      contentType = "text/html";

      if (contentType === "text/html") content = serveInjectSSE(content);

      return new Response(content, {
        status: 200,
        headers: {
          "content-type": "text/html",
        },
      });
    } else if (!url.pathname.endsWith(".html")) {
      // console.log(DIST + url.pathname + ".html");
      if (await exists(DIST + url.pathname + ".html")) {
        content = await Deno.readTextFile(DIST + url.pathname + ".html");
        contentType = "text/html";

        if (contentType === "text/html") content = serveInjectSSE(content);

        return new Response(content, {
          status: 200,
          headers: {
            "content-type": "text/html",
          },
        });
      }
    }

    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/html",
      },
    });
  });
}

function serveContentType(path: string): string {
  const ext = path.split(".").pop();
  switch (ext) {
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "text/javascript";
    case "json":
      return "application/json";
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "text/plain";
  }
}

function serveInjectSSE(content: string): string {
  const hotReloadScript: string = `
    <script>
        let eventSource = new EventSource("/sssg-hot-reload");
        eventSource.onmessage = (event) => { window.location.reload() };
        eventSource.onerror = (event) => { console.log('ERROR', JSON.stringify(event, null, 2)) };
        eventSource.onopen = (event) => { console.log('OPEN', JSON.stringify(event, null, 2)) };
        eventSource.onclose = (event) => { console.log('CLOSED', JSON.stringify(event, null, 2)) };
    </script>`;
  return content.replace("</body>", hotReloadScript + "</body>");
}

async function watch() {
  const watcher = Deno.watchFs(SRC);
  for await (const event of watcher) {
    console.log(">>>>> Event.path:", event.paths[0]);
    if (["create", "modify", "rename", "remove"].includes(event.kind)) {
      // TODO: rebuild stuff after the event depending on what it is
      for await (const path of event.paths) {
        if (path.includes(SRC + "/assets")) {
          // TODO: rebuild everything
          handleAssetEvent(event);
        } else if (path.includes(SRC + "/layouts")) {
          // TODO: rebuild dependents
          handleLayoutEvent(event);
        } else if (path.includes(SRC + "/pages")) {
          // TODO: rebuild the page
          handlePageEvent(event);
        } else if (path.includes(SRC + "/snippets")) {
          // TODO: rebuild the dependents
          handleSnippetEvent(event);
        }
      }
      for (const controller of SSE_CONTROLLERS) {
        if (controller.desiredSize === 0) SSE_CONTROLLERS.delete(controller);
        else controller.enqueue(new TextEncoder().encode("data: RELOAD\n\n"));
      }
    }
  }
}

main();

function pipeThrough(arg0: TarStream) {
  throw new Error("Function not implemented.");
}
