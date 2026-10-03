import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
function worker({ enabled = true, failStorage = false, failNetwork = false } = {}) {
  const listeners = new Map(), stored = new Map([["unrelated", new Map()], ["tracking-shell-v1", new Map()], ["unnamed-tracking:pwa:old", new Map()]]);
  const calls = [];
  let unregistered = false;
  const self = { location: { origin: "https://tracking.test" },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => {}, clients: { claim: async () => {} },
    registration: { unregister: async () => { unregistered = true; }, update: async () => {} } };
  const caches = { keys: async () => [...stored.keys()], delete: async key => stored.delete(key),
    open: async key => {
      if (failStorage) throw new Error("storage denied");
      if (!stored.has(key)) stored.set(key, new Map());
      return { put: async (url, response) => stored.get(key).set(url, response), match: async url => stored.get(key).get(url) };
    } };
  const fetch = async request => {
    const url = typeof request === "string" ? request : request.url;
    calls.push(url);
    if (failNetwork) throw new Error("offline");
    if (url === "/pwa/status") return Response.json({ enabled: true, generation: "new" });
    return new Response(url === "/pwa/offline.html" ? "Waiting for internet" : "private online document", { headers: { "Content-Type": "text/html" } });
  };
  vm.runInNewContext(source, { PWA: { enabled, generation: "new" }, self, caches, fetch, URL, Response });
  async function emit(name, extra = {}) {
    const work = [];
    let response;
    listeners.get(name)({ ...extra, waitUntil: task => work.push(task), respondWith: task => { response = task; } });
    await Promise.all(work);
    return response ? await response : undefined;
  }
  return { stored, calls, emit, unregistered: () => unregistered };
}

test("activation migrates only owned caches; only neutral offline HTML is cached", async () => {
  const w = worker();
  await w.emit("install");
  await w.emit("activate");
  assert.deepEqual([...w.stored.keys()].sort(), ["unnamed-tracking:pwa:new", "unrelated"]);
  assert.deepEqual([...w.stored.get("unnamed-tracking:pwa:new").keys()], ["/pwa/offline.html"]);
});

test("private APIs, auth, non-GET and cross-origin traffic pass through", async () => {
  const w = worker();
  for (const [url, method, mode] of [
    ["https://tracking.test/api/private?anything=1", "GET", "navigate"],
    ["https://tracking.test/API/private", "GET", "navigate"],
    ["https://tracking.test/login", "GET", "navigate"],
    ["https://tracking.test/auth/callback", "GET", "navigate"],
    ["https://tracking.test/document", "POST", "navigate"],
    ["https://outside.test/", "GET", "navigate"],
    ["https://tracking.test/download", "GET", "cors"],
  ]) {
    assert.equal(await w.emit("fetch", { request: { url, method, mode } }), undefined);
  }
  assert.equal(w.calls.length, 0);
});

test("online private documents never become runtime cache entries", async () => {
  const w = worker();
  await w.emit("install");
  const response = await w.emit("fetch", { request: { url: "https://tracking.test/games", method: "GET", mode: "navigate" } });
  assert.equal(await response.text(), "private online document");
  assert.deepEqual([...w.stored.get("unnamed-tracking:pwa:new").keys()], ["/pwa/offline.html"]);
});

test("cache/network failure yields neutral guidance and rejects failed precache", async () => {
  const w = worker({ failStorage: true, failNetwork: true });
  await assert.rejects(w.emit("install"));
  const response = await w.emit("fetch", { request: { url: "https://tracking.test/", method: "GET", mode: "navigate" } });
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Waiting for internet/);
  assert.ok(w.stored.has("unnamed-tracking:pwa:old"));
});

test("disable and explicit retirement unregister without touching other origin caches", async () => {
  const w = worker({ enabled: false });
  await w.emit("install");
  await w.emit("activate");
  assert.ok(w.unregistered());
  assert.deepEqual([...w.stored.keys()], ["unrelated"]);
  const active = worker();
  await active.emit("install");
  await active.emit("message", { data: { type: "tracking-pwa-retire" } });
  assert.ok(active.unregistered());
  assert.equal(await active.emit("fetch", { request: { url: "https://tracking.test/", method: "GET", mode: "navigate" } }), undefined);
});

test("public install metadata and icons remain 0.0.x with full-root launch", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url)));
  const version = JSON.parse(await readFile(new URL("../version.json", import.meta.url)));
  assert.match(version.version, /^0\.0\.\d+$/);
  assert.equal(manifest.start_url, "/?pwa=1");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.id, "/");
  for (const size of [192, 512]) {
    const bytes = await readFile(new URL(`../icon-${size}.png`, import.meta.url));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});
