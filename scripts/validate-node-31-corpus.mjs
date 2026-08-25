import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const manifestPath = "docs/qa/NODE-31_RC_EVIDENCE_V1.json";
const corpusRoot = "qa/corpus/node31/class-b";

const fixtures = [
  { category: "landing-page", file: "landing-page.html", required: [] },
  { category: "ecommerce", file: "ecommerce.html", required: [] },
  { category: "docs", file: "docs.html", required: [] },
  { category: "dashboard", file: "dashboard.html", required: [] },
  { category: "table", file: "table.html", required: ["<table"] },
  { category: "saas-shell", file: "saas-shell.html", required: [] },
  {
    category: "local-site",
    file: "local-site.html",
    required: ["./local-site-mark.svg"],
  },
  {
    category: "shadow-dom",
    file: "shadow-dom.html",
    required: ["attachShadow({mode:'open'})", "<fixture-card>"],
  },
  {
    category: "iframe",
    file: "iframe.html",
    required: ["<iframe", "srcdoc="],
  },
  {
    category: "canvas",
    file: "canvas.html",
    required: ["getContext('2d')", "<canvas"],
  },
  {
    category: "webgl",
    file: "webgl.html",
    required: ["getContext('webgl'", "<canvas"],
  },
  {
    category: "responsive-app",
    file: "responsive-app.html",
    required: ["container-type:inline-size", "@container"],
  },
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(path) {
  try {
    return readFileSync(resolve(root, path), "utf8");
  } catch (error) {
    failures.push(`unable to read ${path}: ${String(error)}`);
    return "";
  }
}

const observedCategories = [];
for (const fixture of fixtures) {
  const path = `${corpusRoot}/${fixture.file}`;
  assert(existsSync(resolve(root, path)), `missing Class B fixture ${path}`);
  const source = read(path);
  assert(source.startsWith("<!doctype html>"), `${path} must be an HTML fixture`);
  const matches = [...source.matchAll(/data-node31-category="([^"]+)"/g)].map((match) => match[1]);
  assert(matches.length === 1, `${path} must declare exactly one data-node31-category`);
  assert(matches[0] === fixture.category, `${path} category must be ${fixture.category}`);
  observedCategories.push(matches[0]);
  for (const marker of fixture.required) {
    assert(source.includes(marker), `${path} missing semantic marker ${marker}`);
  }
}

const expectedCategories = fixtures.map((fixture) => fixture.category).sort();
const actualCategories = observedCategories.filter(Boolean).sort();
assert(
  JSON.stringify(actualCategories) === JSON.stringify(expectedCategories),
  "Class B fixture categories must be complete and unique",
);

const localMarkPath = `${corpusRoot}/local-site-mark.svg`;
assert(existsSync(resolve(root, localMarkPath)), `missing ${localMarkPath}`);
const localMark = read(localMarkPath);
assert(localMark.trimStart().startsWith("<svg"), `${localMarkPath} must be SVG`);
assert(localMark.includes('aria-label="Local fixture mark"'), `${localMarkPath} identity mismatch`);
assert(!localMark.includes("<!doctype html>"), `${localMarkPath} must not contain HTML fixture content`);

let manifest;
try {
  manifest = JSON.parse(read(manifestPath));
} catch (error) {
  failures.push(`invalid JSON ${manifestPath}: ${String(error)}`);
}

if (manifest) {
  const classB = Array.isArray(manifest.classB) ? manifest.classB : [];
  assert(classB.length === fixtures.length, "NODE-31 manifest must contain all Class B fixtures");
  const byCategory = new Map(classB.map((entry) => [entry?.category, entry]));
  for (const fixture of fixtures) {
    const entry = byCategory.get(fixture.category);
    const expectedPath = `${corpusRoot}/${fixture.file}`;
    assert(entry, `NODE-31 manifest missing Class B category ${fixture.category}`);
    assert(
      entry?.sourceArtifact === expectedPath,
      `NODE-31 manifest ${fixture.category} sourceArtifact must be ${expectedPath}`,
    );
  }
}

if (failures.length > 0) {
  console.error(`NODE-31 corpus validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("NODE-31 Class B corpus semantic validation passed.");
}
