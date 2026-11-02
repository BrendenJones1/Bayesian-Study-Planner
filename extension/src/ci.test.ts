import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";

const ci = readFileSync("../.github/workflows/ci.yml", "utf8");

describe("criterion 1: extension defines lint, test and build scripts", () => {
  it.each(["lint", "test", "build"])("package.json has %s", (s) =>
    expect(pkg.scripts).toHaveProperty(s));
});

describe("criterion 2: ci.yml runs all of them on a PR", () => {
  it("triggers on pull_request", () => expect(ci).toMatch(/^\s*pull_request:/m));
  it.each(["npm run lint", "npm test", "npm run build", "ruff check .", "pytest -q"])(
    "runs %s", (cmd) => expect(ci).toContain(cmd));
});
