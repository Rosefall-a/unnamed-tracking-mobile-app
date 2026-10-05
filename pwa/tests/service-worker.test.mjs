import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../service-worker.js", import.meta.url), "utf8");
function worker({ enabled = true, failStorage = false, failNetwork = false, statusEnabled = true, beforePut, assetType = "text/css" } = {}) {
  const listeners = new Map(), stored = new Map([["unrelated", new Map()], ["tracking-shell-v1", new Map()], ["unnamed-tracking:pwa:old", new Map()]]);
  const calls = [];
  let unregistered = false;
  const self = { location: { origin: "https://tracking.test" },
    addEventListener: (name, callback) => listeners.set(name, callback),
    skipWaiting: async () => {}, clients: { claim: async () => {} },
    registration: { unregister: async () => { unregistered = true; }, update: async () => {} } };
  const caches = { keys: async () => [...stored.keys()], delete: async key => stored.delete(key),
    match: async (url, { cacheName }) => {
      if (failStorage) throw new Error("storage denied");
      return stored.get(cacheName)?.get(url);
    },
    open: async key => {
      if (failStorage) throw new Error("storage denied");
      if (!stored.has(key)) stored.set(key, new Map());
      return { put: async (url, response) => { if (beforePut) await beforePut(url); stored.get(key).set(url, response); }, match: async url => stored.get(key).get(url),
        keys: async () => [...stored.get(key).keys()].map(url => ({ url: new URL(url, self.location.origin).href })), delete: async request => stored.get(key).delete(request.url) };
    } };
  const fetch = async request => {
    const url = typeof request === "string" ? request : request.url;
    calls.push(url);
    if (failNetwork) throw new Error("offline");
    if (url === "/pwa/status") return Response.json({ enabled: statusEnabled, generation: "new" });
    if (url.includes("/api/themes/assets/")) return new Response("public CSS", { headers: { "Content-Type": assetType, "Cache-Control": "public, max-age=31536000, immutable" } });
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
  return { stored, calls, emit, unregistered: () => unregistered, offline: () => { failNetwork = true; } };
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

test("retirement waits for in-flight precache and acknowledges complete cleanup", async () => {
  let releasePut, beganPut;
  const blocked = new Promise(resolve => { releasePut = resolve; });
  const started = new Promise(resolve => { beganPut = resolve; });
  const w = worker({ beforePut: async () => { beganPut(); await blocked; } });
  const install = w.emit("install");
  await started;
  let acknowledged = false;
  const retirement = w.emit("message", { data: { type: "tracking-pwa-retire" },
    ports: [{ postMessage: value => { acknowledged = value.type === "tracking-pwa-retired"; } }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.unregistered(), false);
  releasePut();
  await Promise.all([install, retirement]);
  await w.emit("activate");
  assert.ok(w.unregistered());
  assert.ok(acknowledged);
  assert.deepEqual([...w.stored.keys()], ["unrelated"]);
});

test("offline fallback never recreates a missing or retired cache", async () => {
  const w = worker({ failNetwork: true });
  const response = await w.emit("fetch", { request: { url: "https://tracking.test/", method: "GET", mode: "navigate" } });
  assert.equal(response.status, 503);
  assert.equal(w.stored.has("unnamed-tracking:pwa:new"), false);
});

test("stale enabled worker retires if provider was disabled during installation", async () => {
  const w = worker({ statusEnabled: false });
  await w.emit("install");
  await w.emit("activate");
  assert.ok(w.unregistered());
  assert.deepEqual([...w.stored.keys()], ["unrelated"]);
});

test("only immutable public theme assets are cached and available offline", async () => {
  const w = worker();
  await w.emit("install");
  const url = `https://tracking.test/api/themes/assets/official.forest/${"a".repeat(64)}/theme.css`;
  const request = { url, method: "GET", mode: "cors" };
  assert.equal(await (await w.emit("fetch", { request })).text(), "public CSS");
  w.offline();
  assert.equal(await (await w.emit("fetch", { request })).text(), "public CSS");
  assert.equal(await w.emit("fetch", { request: { ...request, url: "https://tracking.test/api/themes" } }), undefined);
  assert.equal(await w.emit("fetch", { request: { ...request, url: url + "?account=private" } }), undefined);
  assert.equal(await w.emit("fetch", { request: { ...request, mode: "navigate" } }), undefined);
  const invalid = worker({ assetType: "text/html" });
  await invalid.emit("install");
  await invalid.emit("fetch", { request });
  assert.deepEqual([...invalid.stored.get("unnamed-tracking:pwa:new").keys()], ["/pwa/offline.html"]);
});

test("theme cache is bounded and explicit retirement removes every cosmetic asset", async () => {
  const w = worker();
  await w.emit("install");
  for (let index = 0; index < 35; index++) await w.emit("fetch", { request: {
    url: `https://tracking.test/api/themes/assets/official.forest/${"a".repeat(64)}/${index}.css`, method: "GET", mode: "cors",
  } });
  assert.equal(w.stored.get("unnamed-tracking:pwa:new").size, 33);
  assert.ok(w.stored.get("unnamed-tracking:pwa:new").has("/pwa/offline.html"));
  await w.emit("message", { data: { type: "tracking-pwa-retire" } });
  assert.deepEqual([...w.stored.keys()], ["unrelated"]);
});

test("retirement also waits for an in-flight public theme cache write", async () => {
  let beganPut, releasePut;
  const started = new Promise(resolve => { beganPut = resolve; });
  const blocked = new Promise(resolve => { releasePut = resolve; });
  const w = worker({ beforePut: async url => { if (url.includes("/api/themes/assets/")) { beganPut(); await blocked; } } });
  await w.emit("install");
  const asset = w.emit("fetch", { request: { url: `https://tracking.test/api/themes/assets/official.forest/${"a".repeat(64)}/theme.css`, method: "GET", mode: "cors" } });
  await started;
  const retirement = w.emit("message", { data: { type: "tracking-pwa-retire" } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(w.unregistered(), false);
  releasePut();
  await Promise.all([asset, retirement]);
  assert.equal(w.unregistered(), true);
  assert.deepEqual([...w.stored.keys()], ["unrelated"]);
});
