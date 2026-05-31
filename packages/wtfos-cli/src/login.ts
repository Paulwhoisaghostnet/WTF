import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig, saveSession } from "./config.js";
import { extractSessionCookie, wtfosJson } from "./http.js";

export async function loginInteractive(usernameArg?: string, passwordArg?: string) {
  const { baseUrl } = loadConfig();
  let username = usernameArg?.trim() ?? "";
  let password = passwordArg ?? "";

  if (!username || !password) {
    const rl = createInterface({ input, output, terminal: true });
    try {
      if (!username) username = (await rl.question("Username: ")).trim();
      if (!password) password = await rl.question("Password: ");
    } finally {
      rl.close();
    }
  }

  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  if (passwordArg) {
    console.warn(
      "Warning: passing --password exposes credentials in your shell process list. Prefer interactive login."
    );
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Login failed (${response.status}).`);
  }

  const cookie = extractSessionCookie(response);
  if (!cookie) {
    throw new Error("Login succeeded but no session cookie was returned.");
  }

  const user = (await response.json()) as {
    username?: string;
    displayName?: string;
    name?: string;
  };

  saveSession({
    cookie,
    username: user.username ?? username,
    displayName: user.displayName ?? user.name ?? null,
  });

  return user.username ?? username;
}

export async function printWhoami() {
  const user = await wtfosJson<{ username?: string; displayName?: string; name?: string }>(
    "/api/auth/user"
  );
  if (!user?.username) {
    console.log("Not signed in.");
    return;
  }
  const label = user.displayName ?? user.name;
  console.log(label ? `${label} (@${user.username})` : `@${user.username}`);
}
