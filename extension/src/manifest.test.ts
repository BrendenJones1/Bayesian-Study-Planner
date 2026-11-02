import { describe, expect, it } from "vitest";
import manifest from "../public/manifest.json";

describe("manifest", () => {
  it("is Manifest V3", () => expect(manifest.manifest_version).toBe(3));
  it("has host permission only for canvas.ubc.ca", () => {
    expect(manifest.host_permissions).toEqual(["https://canvas.ubc.ca/*"]);
    expect(manifest.permissions).not.toContain("<all_urls>");
  });
});
