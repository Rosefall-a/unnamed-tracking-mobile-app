import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const html = await readFile(new URL("../offline.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const roles = ["background", "surface", "surface_alt", "text", "muted", "accent", "success", "warning", "error", "info", "purple"];
const colors = background => Object.fromEntries(roles.map(role => [role, role === "background" ? background : "#775599"]));
const appearance = { version: 1, theme: "system", palette: "custom", highContrast: true,
  colors: { light: colors("#eeeeff"), dark: colors("#221133") } };

function page({ saved, legacy, dark = false, denied = false, stylesheet, packageId } = {}) {
  const values = new Map(), reads = [], events = new Map(), retry = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value), removeProperty: key => values.delete(key) } };
  const meta = {}, links = [];
  const system = { matches: dark, addEventListener: (name, callback) => events.set("system", callback) };
  let reloads = 0;
  const sandbox = { document: { documentElement: root, querySelector: () => meta, getElementById: () => ({ addEventListener: (name, callback) => retry.set(name, callback) }),
    createElement: () => ({ addEventListener: (name, callback) => events.set('stylesheet:'+name, callback) }), head: { append: link => links.push(link) } },
    matchMedia: () => system, localStorage: { getItem: key => { reads.push(key); if (denied) throw Error("denied"); return key === "ui-appearance" ? saved : key === "ui-theme-stylesheet" ? stylesheet : key === "ui-theme-package" ? packageId : legacy; } },
    getComputedStyle: () => ({ getPropertyValue: key => values.get(key) || (root.dataset.theme === "dark" ? "#17191c" : "#f5f4f1") }),
    window: { addEventListener: (name, callback) => events.set(name, callback) }, location: { reload: () => reloads++ } };
  vm.createContext(sandbox);
  for (const script of scripts) vm.runInContext(script, sandbox);
  return { root, values, meta, reads, retry, events, system, links, get reloads() { return reloads; } };
}

test("offline launch follows the cosmetic custom palette and live system changes", () => {
  const current = page({ saved: JSON.stringify(appearance) });
  assert.equal(current.meta.content, "#eeeeff");
  assert.equal(current.values.get("--ui-dim"), appearance.colors.light.text);
  current.system.matches = true;
  current.events.get("system")();
  assert.equal(current.root.dataset.theme, "dark");
  assert.equal(current.meta.content, "#221133");
  assert.deepEqual(current.reads, ["ui-theme", "ui-appearance", "ui-theme-stylesheet", "ui-theme-package"]);
});

test("invalid or unavailable device colors fall back without applying arbitrary CSS", () => {
  const invalid = structuredClone(appearance);
  invalid.colors.dark.background = "url(https://invalid.test)";
  for (const options of [{ saved: JSON.stringify(invalid), dark: true }, { saved: "bad json", dark: true }, { denied: true, dark: true }]) {
    const current = page(options);
    assert.equal(current.meta.content, "#17191c");
    assert.equal(current.values.size, 0);
  }
});

test("explicit Light remains light and reconnect controls reload the online application", () => {
  const current = page({ saved: JSON.stringify({ ...appearance, theme: "light" }), dark: true });
  assert.equal(current.root.dataset.theme, "light");
  current.retry.get("click")();
  current.events.get("online")();
  assert.equal(current.reloads, 2);
});

test("offline styling accepts only digest-addressed theme CSS on this host", () => {
  const stylesheet = `/api/themes/assets/official.forest/${"a".repeat(64)}/theme.css`;
  const current = page({ saved: JSON.stringify(appearance), stylesheet, packageId: "official.forest" });
  assert.equal(current.root.dataset.themePackage, "official.forest");
  assert.equal(current.links[0].href, stylesheet);
  for (const css of ["https://outside.test/theme.css", "javascript:alert(1)", stylesheet + "?anything=1", stylesheet.replace("theme.css", "../private.css")]) {
    assert.equal(page({ stylesheet: css, packageId: "official.forest" }).links.length, 0);
  }
});

test("a loaded installed theme takes precedence over native palette overrides", () => {
  const stylesheet = `/api/themes/assets/official.forest/${"a".repeat(64)}/theme.css`;
  const current = page({ saved: JSON.stringify(appearance), stylesheet, packageId: "official.forest" });
  assert.equal(current.values.get("--ui-bg"), "#eeeeff");
  current.events.get("stylesheet:load")();
  assert.equal(current.values.size, 0);
  assert.equal(current.root.dataset.themePackage, "official.forest");
  current.system.matches = true;
  current.events.get("system")();
  assert.equal(current.values.size, 0);
  assert.equal(current.root.dataset.theme, "dark");
});

test("a missing offline theme falls back to the retained personal palette", () => {
  const stylesheet = `/api/themes/assets/official.forest/${"a".repeat(64)}/theme.css`;
  const current = page({ saved: JSON.stringify(appearance), stylesheet, packageId: "official.forest" });
  current.events.get("stylesheet:error")();
  assert.equal(current.root.dataset.themePackage, "native");
  assert.equal(current.meta.content, "#eeeeff");
  current.system.matches = true;
  current.events.get("system")();
  assert.equal(current.meta.content, "#221133");
});
