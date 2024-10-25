import { TarStream, TarStreamInput } from "jsr:@std/tar";

export async function zip(src: string, dst: string) {
  const fileArray: TarStreamInput[] = [];

  async function processDirectory(directory: string, basePath: string = "") {
    for await (const entry of Deno.readDir(directory)) {
      const fullPath = `${directory}/${entry.name}`;
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.isDirectory) {
        fileArray.push({
          type: "directory",
          path: relativePath,
        });
        await processDirectory(fullPath, relativePath);
      } else {
        fileArray.push({
          type: "file",
          path: relativePath,
          size: (await Deno.stat(fullPath)).size,
          readable: (await Deno.open(fullPath)).readable,
        });
      }
    }
  }

  await processDirectory(src);

  await ReadableStream.from(fileArray)
    .pipeThrough(new TarStream())
    .pipeThrough(new CompressionStream("gzip"))
    .pipeTo((await Deno.create(dst)).writable);
}
