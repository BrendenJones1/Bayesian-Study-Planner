import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";
import { FREEBUSY_SCOPE, FREEBUSY_URL } from "./calendar/freebusy";
import pkg from "../package.json";
import bundledCpts from "../../priors/tables/cpts.json";

describe("criterion 1: extension is Vite + TS + React, MV3, host permission only canvas.ubc.ca", () => {
  it("is Manifest V3", () => expect(manifest.manifest_version).toBe(3));

  it("host_permissions is exactly canvas.ubc.ca and the Google freeBusy endpoint, with no wildcard hosts or <all_urls>", () => {
    expect(manifest.host_permissions).toEqual(["https://canvas.ubc.ca/*", FREEBUSY_URL]);
    expect(JSON.stringify(manifest)).not.toContain("<all_urls>");
    expect(manifest).not.toHaveProperty("optional_host_permissions");
    expect(manifest).not.toHaveProperty("content_scripts");
  });

  it("requests only the idle and identity API permissions", () => {
    expect(manifest.permissions).toEqual(["idle", "identity"]);
  });

  it("issue 61: oauth2 block asks only for the calendar.freebusy scope", () => {
    expect(manifest.oauth2.scopes).toEqual([FREEBUSY_SCOPE]);
  });

  it("build puts manifest.json and popup.html at the dist root", () => {
    execSync("npx vite build", { stdio: "pipe" });
    expect(existsSync("dist/manifest.json")).toBe(true);
    expect(existsSync("dist/popup.html")).toBe(true);
    expect(readdirSync("dist/assets").length).toBeGreaterThan(0);
  }, 120_000);
});

describe("issue 60: MVP package", () => {
  it("manifest version and package.json version are both 0.1.0", () => {
    expect(manifest.version).toBe("0.1.0");
    expect(pkg.version).toBe("0.1.0");
    expect(manifest.version).toBe(pkg.version);
  });

  it("the built dist bundles the cpts.json tables", () => {
    execSync("npx vite build", { stdio: "pipe" });
    const js = readdirSync("dist/assets")
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(`dist/assets/${f}`, "utf8"))
      .join("\n");
    // Minified JSON keeps its keys, so the model version string appears in the bundle.
    expect(js).toContain(JSON.stringify(bundledCpts.model_version));
    expect(js).toContain(bundledCpts.built_at);
  }, 120_000);

  it("permissions are exactly [idle, identity] and hosts exactly canvas.ubc.ca and Google freeBusy", () => {
    expect(manifest.permissions).toEqual(["idle", "identity"]);
    expect(manifest.host_permissions).toEqual(["https://canvas.ubc.ca/*", FREEBUSY_URL]);
  });
});
