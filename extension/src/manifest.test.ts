import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";

describe("criterion 1: extension is Vite + TS + React, MV3, host permission only canvas.ubc.ca", () => {
  it("is Manifest V3", () => expect(manifest.manifest_version).toBe(3));

  it("host_permissions is exactly canvas.ubc.ca, with no wildcard hosts or <all_urls>", () => {
    expect(manifest.host_permissions).toEqual(["https://canvas.ubc.ca/*"]);
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
    expect(manifest).not.toHaveProperty("optional_host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("requests no API permissions yet", () => {
    expect(manifest).not.toHaveProperty("permissions");
  });

  it("build puts manifest.json and popup.html at the dist root", () => {
    execSync("npx vite build", { stdio: "pipe" });
    expect(existsSync("dist/manifest.json")).toBe(true);
    expect(existsSync("dist/popup.html")).toBe(true);
  }, 120_000);
});
