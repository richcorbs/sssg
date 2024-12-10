import { parseArgs } from "@std/cli/parse-args";
import { build } from "./build.ts";
import { checkSrcSetup, copyInitFiles } from "./init.ts";
import { deploy, register } from "./deploy.ts";
import { serve, watch } from "./hotReload.ts";

async function main(): Promise<void> {
  const flags = parseArgs(Deno.args);

  checkSrcSetup();

  if (flags.init) await copyInitFiles();
  else if (flags.build) await build();
  else if (flags.dev) {
    build();
    watch();
    serve();
  } else if (flags.register) {
    await register(flags.domain);
  } else if (flags.deploy) {
    await build();
    await deploy(flags.staging, flags.production);
  }
}

main();
