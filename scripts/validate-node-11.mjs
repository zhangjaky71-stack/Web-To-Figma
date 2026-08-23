import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function walk(directory) {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  const files = [];
  for (const entry of readdirSync(absolute)) {
    const relative = `${directory}/${entry}`;
    const target = resolve(root, relative);
    if (statSync(target).isDirectory()) files.push(...walk(relative));
    else files.push(relative);
  }
  return files;
}

for (const path of [
  "packages/css-cascade/package.json",
  "packages/css-cascade/tsconfig.json",
  "packages/css-cascade/tsconfig.build.json",
  "packages/css-cascade/src/types.ts",
  "packages/css-cascade/src/cascade.ts",
  "packages/css-cascade/src/length.ts",
  "packages/css-cascade/src/tokens.ts",
  "packages/css-cascade/src/index.ts",
  "packages/css-cascade/test/css-cascade.test.ts",
]) {
  assert(existsSync(resolve(root, path)), `NODE-11 missing ${path}`);
}

if (failures.length === 0) {
  const packageJson = JSON.parse(read("packages/css-cascade/package.json"));
  assert(packageJson.name === "@w2f/css-cascade", "NODE-11 package name drifted");
  assert(packageJson.dependencies?.["@w2f/w2f-ir"] === "workspace:*", "NODE-11 must reuse W2F IR");
  assert(
    packageJson.dependencies?.["@w2f/w2f-schema"] === "workspace:*",
    "NODE-11 must reuse W2F schema Token Graph",
  );

  const types = read("packages/css-cascade/src/types.ts");
  assert(types.includes('CSS_CASCADE_ENGINE_VERSION = "1.0.0"'), "NODE-11 cascade version drifted");
  for (const evidence of [
    "authoredValue",
    "important",
    "inactive-condition",
    "mediaConditions",
    "sourceOrder",
    "referenceDefinitionKeys",
  ]) {
    assert(types.includes(evidence), `NODE-11 evidence contract missing ${evidence}`);
  }

  const cascade = read("packages/css-cascade/src/cascade.ts");
  for (const evidence of [
    "createCascadePropertyTrace",
    "createNodeCascadeEvidence",
    "createCascadePayload",
    "toWtfStyleRecord",
    "multiple winners",
    "cascadeHash",
  ]) {
    assert(cascade.includes(evidence), `NODE-11 cascade engine missing ${evidence}`);
  }

  const length = read("packages/css-cascade/src/length.ts");
  for (const evidence of ["percent", "em", "rem", "viewport", "keyword", "expression", "resolvedPx"]) {
    assert(length.includes(evidence), `NODE-11 CSS length model missing ${evidence}`);
  }

  const tokens = read("packages/css-cascade/src/tokens.ts");
  for (const evidence of [
    "buildTokenGraph",
    "extractVarReferenceNames",
    "unknown definition",
    "definitionIds",
    "referenceDefinitionKeys",
  ]) {
    assert(tokens.includes(evidence), `NODE-11 Token Graph engine missing ${evidence}`);
  }

  const runtimeSources = walk("packages/css-cascade/src")
    .filter((path) => path.endsWith(".ts"))
    .map((path) => read(path))
    .join("\n");
  for (const forbidden of ["getComputedStyle(", "document.", "window.", "CSSStyleSheet", "CSSRuleList"]) {
    assert(
      !runtimeSources.includes(forbidden),
      `NODE-11 core engine must remain platform-neutral; found ${forbidden}`,
    );
  }

  const ir = read("packages/w2f-ir/src/types.ts");
  assert(ir.includes("WtfCssLengthSemantic"), "NODE-11 requires existing IR CSS length semantics");
  assert(ir.includes("WtfStyleDeclaration"), "NODE-11 requires existing IR style declarations");
  assert(ir.includes("WtfStyleRecord"), "NODE-11 requires existing IR style records");

  const schema = read("packages/w2f-schema/src/index.ts");
  assert(schema.includes("WtfTokenGraph"), "NODE-11 requires V2.1 Token Graph schema");
  assert(schema.includes('sourceCascade: "source/cascade.json"'), "NODE-11 requires source/cascade entrypoint");
  assert(schema.includes('tokens: "tokens.json"'), "NODE-11 requires tokens entrypoint");
}

if (failures.length > 0) {
  console.error("NODE-11 foundation validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NODE-11 foundation validation passed.");
