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

function page({ saved, legacy, dark = false, denied = false } = {}) {
  const values = new Map(), reads = [], events = new Map(), retry = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value) } };
  const meta = {};
  const system = { matches: dark, addEventListener: (name, callback) => events.set("system", callback) };
  let reloads = 0;
  const sandbox = { document: { documentElement: root, querySelector: () => meta, getElementById: () => ({ addEventListener: (name, callback) => retry.set(name, callback) }) },
    matchMedia: () => system, localStorage: { getItem: key => { reads.push(key); if (denied) throw Error("denied"); return key === "ui-appearance" ? saved : legacy; } },
    getComputedStyle: () => ({ getPropertyValue: key => values.get(key) || (root.dataset.theme === "dark" ? "#17191c" : "#f5f4f1") }),
    window: { addEventListener: (name, callback) => events.set(name, callback) }, location: { reload: () => reloads++ } };
  vm.createContext(sandbox);
  for (const script of scripts) vm.runInContext(script, sandbox);
  return { root, values, meta, reads, retry, events, system, get reloads() { return reloads; } };
}

test("offline launch follows the cosmetic custom palette and live system changes", () => {
  const current = page({ saved: JSON.stringify(appearance) });
  assert.equal(current.meta.content, "#eeeeff");
  assert.equal(current.values.get("--ui-dim"), appearance.colors.light.text);
  current.system.matches = true;
  current.events.get("system")();
  assert.equal(current.root.dataset.theme, "dark");
  assert.equal(current.meta.content, "#221133");
  assert.deepEqual(current.reads, ["ui-theme", "ui-appearance"]);
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
