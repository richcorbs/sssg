import { DIST } from "./config.ts";
import { existsSync } from "@std/fs/exists";
import { zip } from "./zip.ts";

export const API_URL = import.meta.url.includes("/Users/rich/Code") ? "http://domains.local:8000" : "https://api.sssg.dev";

export async function register(domain: string) {
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
    `${API_URL}/api/register?domain=` + domain,
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
  } else if (registrationResponse.status === 409) {
    const error = await registrationResponse.json();
    console.log(`\nThere was an error:\n\n${error.message}\n`);
  }
}

export async function deploy(
  staging: boolean,
  production: boolean,
) {
  if (!existsSync("./.sssg.json")) {
    console.log("You must register a domain first");
    Deno.exit(1);
  }
  const rawConfig = Deno.readTextFileSync("./.sssg.json");
  const config = JSON.parse(rawConfig);

  if (!config.token) {
    const registrationResponse: Response = await fetch(
      `${API_URL}/api/register`,
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
  const response = await fetch(`${API_URL}/api/domain/upload`, {
    method: "POST",
    body: form,
  });
  console.log("response", response);
  if (existsSync(zipFilename)) {
    await Deno.remove(zipFilename, { recursive: true });
  }
}
