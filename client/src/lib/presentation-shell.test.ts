import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESENTATION_HOST_SESSION_KEY,
  presentationRouteHref,
  rememberPresentationHost,
} from "./presentation-shell";

function withWindow<T>(href: string, run: () => T): T {
  const url = new URL(href);
  const storage = new Map<string, string>();
  const fakeWindow = {
    location: url,
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: fakeWindow,
    configurable: true,
  });
  try {
    return run();
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
}

test("presentationRouteHref is a no-op outside an alternate presentation shell", () => {
  withWindow("http://127.0.0.1:4173/profile", () => {
    assert.equal(presentationRouteHref("/live?tab=rooms"), "/live?tab=rooms");
    assert.equal(presentationRouteHref("https://example.com/live"), "https://example.com/live");
  });
});

test("presentationRouteHref keeps production Gamma on the Gamma hostname", () => {
  withWindow("https://gamma.wtfos.app/skywire", () => {
    assert.equal(presentationRouteHref("/live?tab=rooms"), "/live?tab=rooms");
    assert.equal(presentationRouteHref("https://wtfos.app/dicksword"), "/dicksword");
    assert.equal(presentationRouteHref("/api/auth/discord"), "/api/auth/discord");
    assert.equal(presentationRouteHref("https://example.com/live"), "https://example.com/live");
  });
});

test("presentationRouteHref maps same-session local Gamma routes through the harness prefix", () => {
  withWindow("http://127.0.0.1:4173/gamma/skywire", () => {
    rememberPresentationHost("gamma");
    assert.equal(presentationRouteHref("/live?tab=stages"), "/gamma/live?tab=stages");
    assert.equal(presentationRouteHref("/gamma/gallery"), "/gamma/gallery");
    assert.equal(presentationRouteHref("https://wtfos.app/user/skllzrmy"), "/gamma/user/skllzrmy");
    assert.equal(presentationRouteHref("/api/atproto/oauth/start"), "/api/atproto/oauth/start");
  });
});

test("presentationRouteHref keeps production Beta on the Beta hostname", () => {
  withWindow("https://beta.wtfos.app/skywire", () => {
    assert.equal(presentationRouteHref("/live?tab=rooms"), "/live?tab=rooms");
    assert.equal(presentationRouteHref("https://wtfos.app/dicksword"), "/dicksword");
    assert.equal(presentationRouteHref("/api/auth/discord"), "/api/auth/discord");
    assert.equal(presentationRouteHref("https://example.com/live"), "https://example.com/live");
  });
});

test("presentationRouteHref maps same-session local Beta routes through the harness prefix", () => {
  withWindow("http://127.0.0.1:4173/beta/skywire", () => {
    rememberPresentationHost("beta");
    assert.equal(presentationRouteHref("/live?tab=stages"), "/beta/live?tab=stages");
    assert.equal(presentationRouteHref("/beta/gallery"), "/beta/gallery");
    assert.equal(presentationRouteHref("https://wtfos.app/user/skllzrmy"), "/beta/user/skllzrmy");
    assert.equal(presentationRouteHref("/api/atproto/oauth/start"), "/api/atproto/oauth/start");
  });
});

test("presentationRouteHref never lets a stored Gamma session hijack local Beta", () => {
  withWindow("http://127.0.0.1:4173/beta", () => {
    window.sessionStorage.setItem(PRESENTATION_HOST_SESSION_KEY, "gamma");
    assert.equal(presentationRouteHref("/live"), "/beta/live");
  });
});

test("presentationRouteHref never lets a stored Beta session hijack local Gamma", () => {
  withWindow("http://127.0.0.1:4173/gamma", () => {
    window.sessionStorage.setItem(PRESENTATION_HOST_SESSION_KEY, "beta");
    assert.equal(presentationRouteHref("/live"), "/gamma/live");
  });
});
