const fs = require("fs");
const path = require("path");
const assert = require("assert");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function rulesFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.rules)) return payload.rules;
  return [payload];
}

function testRulesIndexLoads() {
  const indexPath = path.join(__dirname, "..", "rules", "index.json");
  const index = readJson(indexPath);
  assert(Array.isArray(index.htmlPreprocessors), "htmlPreprocessors must be an array");
  assert(Array.isArray(index.markdownPostprocessors), "markdownPostprocessors must be an array");

  const seen = new Set();
  const ordered = [
    ...index.htmlPreprocessors.map((file) => ["html", file]),
    ...index.markdownPostprocessors.map((file) => ["markdown", file])
  ];

  for (const [phase, file] of ordered) {
    const fullPath = path.join(__dirname, "..", file);
    assert(fs.existsSync(fullPath), `Missing ${phase} rule file: ${file}`);
    const payload = readJson(fullPath);
    const rules = rulesFromPayload(payload);
    rules.forEach((rule, idx) => {
      for (const field of ["id", "description", "pattern", "replacement"]) {
        assert(rule[field] !== undefined, `${file}#${idx + 1} missing ${field}`);
      }
      assert(!seen.has(rule.id), `Duplicate rule id: ${rule.id}`);
      seen.add(rule.id);
      assert.doesNotThrow(() => new RegExp(rule.pattern, rule.flags || "g"), `Invalid regex in ${file}#${idx + 1}`);
    });
  }
}

function testRuleOrderingMatchesLegacy() {
  const legacy = readJson(path.join(__dirname, "..", "rules.json"));
  const index = readJson(path.join(__dirname, "..", "rules", "index.json"));

  const splitHtml = index.htmlPreprocessors.flatMap((file) => {
    const payload = readJson(path.join(__dirname, "..", file));
    return rulesFromPayload(payload);
  });
  const splitMd = index.markdownPostprocessors.flatMap((file) => {
    const payload = readJson(path.join(__dirname, "..", file));
    return rulesFromPayload(payload);
  });

  assert.strictEqual(splitHtml.length, legacy.htmlPreprocessors.length, "HTML rule count changed");
  assert.strictEqual(splitMd.length, legacy.markdownPostprocessors.length, "Markdown rule count changed");

  splitHtml.forEach((rule, i) => {
    const expected = legacy.htmlPreprocessors[i];
    assert.strictEqual(rule.pattern, expected.pattern, `HTML rule pattern mismatch at index ${i}`);
    assert.strictEqual(rule.replacement, expected.replacement, `HTML replacement mismatch at index ${i}`);
    assert.strictEqual(rule.flags || "g", expected.flags || "g", `HTML flags mismatch at index ${i}`);
  });

  splitMd.forEach((rule, i) => {
    const expected = legacy.markdownPostprocessors[i];
    assert.strictEqual(rule.pattern, expected.pattern, `Markdown rule pattern mismatch at index ${i}`);
    assert.strictEqual(rule.replacement, expected.replacement, `Markdown replacement mismatch at index ${i}`);
    assert.strictEqual(rule.flags || "g", expected.flags || "g", `Markdown flags mismatch at index ${i}`);
  });
}

function testLatexEasyMathRemoved() {
  const files = [
    path.join(__dirname, "..", "converter.js"),
    path.join(__dirname, "..", "converter", "plugins", "pluginLoader.js"),
    path.join(__dirname, "..", "converter", "plugins", "imagePlaceholder.js"),
    path.join(__dirname, "..", "converter", "plugins", "expandBlock.js"),
    path.join(__dirname, "..", "converter", "plugins", "panel.js"),
    path.join(__dirname, "..", "converter", "plugins", "mentionPlaceholder.js"),
    path.join(__dirname, "..", "converter", "plugins", "confluenceTable.js"),
    path.join(__dirname, "..", "converter", "plugins", "mathMacro.js"),
    path.join(__dirname, "..", "converter", "plugins", "extensionFallback.js"),
    path.join(__dirname, "..", "converter", "pipeline", "stages.js")
  ];

  const forbidden = [/\bdebugLatex\b/];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of forbidden) {
      assert(!re.test(text), `${file} still contains forbidden token: ${re}`);
    }
  }
}


function testMathMacroRegistration() {
  const loader = fs.readFileSync(path.join(__dirname, "..", "converter", "plugins", "pluginLoader.js"), "utf8");
  const matches = loader.match(/id:\s*"mathMacro"/g) || [];
  assert.strictEqual(matches.length, 1, "mathMacro must be registered exactly once");

  const extensionIdx = loader.indexOf('{ id: "extensionFallback", order: 60 }');
  const mathIdx = loader.indexOf('{ id: "mathMacro", order: 55 }');
  assert(mathIdx !== -1, "mathMacro ordering entry missing");
  assert(extensionIdx !== -1, "extensionFallback ordering entry missing");
  assert(mathIdx < extensionIdx, "mathMacro must run before extensionFallback");
}

function run() {
  testRulesIndexLoads();
  testRuleOrderingMatchesLegacy();
  testLatexEasyMathRemoved();
  testMathMacroRegistration();
  console.log("All tests passed.");
}

run();
