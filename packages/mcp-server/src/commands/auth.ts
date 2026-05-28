import { clearGlobalAuthConfig, loadConfig } from "../config.js";
import { createCodeMapClient } from "../lib/codemap-api.js";
import {
  getMcpWhoAmI,
  startMcpLogin,
  tryOpenLoginBrowser,
  waitForLoginAuthorization,
} from "../lib/mcp-auth.js";

export async function runLoginCommand(): Promise<void> {
  const config = await loadConfig();
  const client = createCodeMapClient(config);
  const startResponse = await startMcpLogin(client);
  const openedBrowser = await tryOpenLoginBrowser(startResponse.authorizeUrl);

  if (openedBrowser) {
    console.log("Opened browser for CodeMap MCP login.");
  } else {
    console.log("Open this URL to continue CodeMap MCP login:");
    console.log(startResponse.authorizeUrl);
  }

  console.log("Waiting for authorization...");
  const result = await waitForLoginAuthorization(config, startResponse);

  console.log("CodeMap MCP login completed.");
  console.log(`API URL: ${result.apiUrl || config.apiUrl}`);
  if (result.user?.email) console.log(`Email: ${result.user.email}`);
  if (result.user?.name) console.log(`Name: ${result.user.name}`);
}

export async function runLogoutCommand(): Promise<void> {
  const config = await loadConfig();
  await clearGlobalAuthConfig(config);
  console.log("Cleared CodeMap MCP stored credentials from global config.");
  console.log(`API URL preserved: ${config.apiUrl}`);
}

export async function runWhoAmICommand(): Promise<void> {
  const config = await loadConfig();

  if (!config.apiToken) {
    console.log("Not authenticated.");
    console.log(`API URL: ${config.apiUrl}`);
    console.log("Run `codemap login` to authenticate.");
    return;
  }

  const me = await getMcpWhoAmI(createCodeMapClient(config));
  console.log("Authenticated with CodeMap.");
  console.log(`API URL: ${me.apiUrl}`);
  if (me.user.email) console.log(`Email: ${me.user.email}`);
  if (me.user.name) console.log(`Name: ${me.user.name}`);
  if (me.user.id) console.log(`User ID: ${me.user.id}`);
}
