import { expect } from "@playwright/test";

/** Cookie/CSRF actor helper for the gameshow HTTP rehearsal; never logs credentials. */
export async function gameshowActor(playwright, baseURL, actor) {
  const request = await playwright.request.newContext({ baseURL });
  const login = await request.post("/api/auth/login", { data: { username: actor.username, password: actor.password } });
  expect(login.ok(), `Gameshow actor login: ${login.status()}`).toBeTruthy();
  const { csrfToken } = await (await request.get("/api/auth/csrf-token")).json();
  expect(csrfToken).toBeTruthy();
  return {
    request,
    write: (method, path, data = {}) => request[method](path, { data, headers: { "X-CSRF-Token": csrfToken } }),
  };
}

export async function gameshowJson(response) {
  expect(response.ok(), `Gameshow request: ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json();
}
