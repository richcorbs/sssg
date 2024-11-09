import "jsr:@std/dotenv/load";

export const SRC = Deno.env.get("SRC") || "src";
export const DIST = Deno.env.get("DIST") || "dist";

// TODO: Handle when .env changes after init
// or when the physical doesn't match .env
// if (SRC === "src" && DIST === "dist") {
//   throw new Error("SRC and DIST must be set");
// }
