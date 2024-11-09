import { DIST, SRC } from "./config.ts";
import { resolve } from "@std/path/resolve";
import { join } from "@std/path/join";
import { debounce } from "jsr:@std/async/debounce";
import {
  handleAssetEvent,
  handleLayoutEvent,
  handlePageEvent,
  handleSnippetEvent,
} from "./build.ts";
import { typeByExtension } from "@std/media-types";
import { exists } from "@std/fs/exists";

export const SSE_SESSIONS: Set<ReadableStreamDefaultController> = new Set();

export function serve(port: number = 8000) {
  try {
    Deno.serve({ port: port }, async (req) => {
      const url = new URL(req.url);

      let content: string;
      let contentType: string;

      if (url.pathname === "/sssg-hot-reload") {
        const body = new ReadableStream({
          start(session) {
            SSE_SESSIONS.add(session);
            session.enqueue(new TextEncoder().encode("data: Hello, World!"));
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
        const extension: string = url.pathname.split(".").pop() || "";
        const contentType: string | undefined = typeByExtension(extension) ||
          "";

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
  } catch (e) {
    if (e instanceof Deno.errors.AddrInUse) {
      if (port <= 8010) {
        serve(port + 1);
      } else {
        console.log("No ports available.");
        Deno.exit(1);
      }
    } else {
      console.log(e);
    }
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

export async function watch() {
  const handleEvent = debounce(async (event: Deno.FsEvent) => {
    if (["create", "modify", "rename", "remove"].includes(event.kind)) {
      // TODO: rebuild stuff after the event depending on what it is
      for await (const path of event.paths) {
        if (path.includes(resolve(join(SRC, "assets")))) {
          // TODO: rebuild everything
          await handleAssetEvent(event);
        } else if (path.includes(resolve(join(SRC, "layouts")))) {
          // TODO: rebuild dependents
          await handleLayoutEvent(event);
        } else if (path.includes(resolve(join(SRC, "pages")))) {
          // TODO: rebuild the page
          await handlePageEvent(event);
        } else if (path.includes(resolve(join(SRC, "snippets")))) {
          // TODO: rebuild the dependents
          await handleSnippetEvent(event);
        }
      }
      for (const session of SSE_SESSIONS) {
        if (session.desiredSize === 0) SSE_SESSIONS.delete(session);
        else session.enqueue(new TextEncoder().encode("data: RELOAD\n\n"));
      }
    }
  }, 100);

  const watcher = Deno.watchFs(SRC);

  for await (const event of watcher) {
    handleEvent(event);
  }
}
