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

function testEscapedHtmlNormalization() {
  const vm = require("vm");
  const stagesCode = fs.readFileSync(path.join(__dirname, "..", "converter", "pipeline", "stages.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(stagesCode, sandbox);

  const normalize = sandbox.window.ConverterPipeline.normalizePotentiallyEscapedHtml;
  assert.strictEqual(typeof normalize, "function", "normalizePotentiallyEscapedHtml must be exported");

  const escaped = '<h1\\n data-local-id="abc">Title</h1>\\n<p>Body</p>';
  const normalized = normalize(escaped);
  assert(normalized.includes(String.fromCharCode(10)), "escaped newlines should become real newlines");
  assert(!normalized.includes("\\n"), "normalized HTML should not contain escaped newline tokens");

  const fenced = "```html\\n<h2\\n data-x=\"1\">H</h2>\\n```";
  const unfenced = normalize(fenced);
  assert(!unfenced.startsWith("```"), "fenced HTML input should be unwrapped");
  assert(unfenced.includes("<h2"), "fenced input should preserve HTML content");
}

function extractStructureSignature(html) {
  return {
    h1: (html.match(/<h1\b/gi) || []).length,
    h2: (html.match(/<h2\b/gi) || []).length,
    p: (html.match(/<p\b/gi) || []).length,
    li: (html.match(/<li\b/gi) || []).length
  };
}

function testConfluenceModePreprocessParity() {
  const vm = require("vm");
  const stagesCode = fs.readFileSync(path.join(__dirname, "..", "converter", "pipeline", "stages.js"), "utf8");
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(stagesCode, sandbox);

  const applyRegexRules = sandbox.window.ConverterPipeline.applyRegexRules;
  assert.strictEqual(typeof applyRegexRules, "function", "applyRegexRules must be exported");

  const rules = readJson(path.join(__dirname, "..", "rules", "index.json"));
  const htmlRules = rules.htmlPreprocessors.flatMap((file) => {
    const payload = readJson(path.join(__dirname, "..", file));
    return rulesFromPayload(payload);
  });

  const editModeHtml = `
<h1 data-prosemirror-node-name="heading" data-pm-slice="1 1 []">Measurement approach</h1>
<p data-prosemirror-node-name="paragraph">Although Key Result 1.3 is measured using a single headline metric.</p>
<ul data-prosemirror-node-name="bulletList"><li data-prosemirror-node-name="listItem"><p>explain changes in the headline metric</p></li><li data-prosemirror-node-name="listItem"><p>guard against misleading improvements</p></li></ul>
<h1 data-prosemirror-node-name="heading">Process</h1>
<h2 data-prosemirror-node-name="heading">Extract</h2>
<p data-prosemirror-node-name="paragraph">Delivery Rate will be calculated from CSV Exports.</p>`;

  const readModeHtml = `
<h1 id="Measurement-approach">Measurement approach<span class="heading-anchor-wrapper"><button data-testid="anchor-button"><span role="img" aria-label="Copy"><svg><path></path></svg></span></button></span></h1>
<p data-renderer-start-pos="1197">Although Key Result 1.3 is measured using a single headline metric.</p>
<ul class="ak-ul"><li><p>explain changes in the headline metric</p></li><li><p>guard against misleading improvements</p></li></ul>
<h1 id="Process">Process<span class="heading-anchor-wrapper"><button><span>Copy</span></button></span></h1>
<h2 id="Extract">Extract<span class="heading-anchor-wrapper"><button><span>Copy</span></button></span></h2>
<p data-renderer-start-pos="1628">Delivery Rate will be calculated from CSV Exports.</p>`;

  const editClean = applyRegexRules(editModeHtml, htmlRules);
  const readClean = applyRegexRules(readModeHtml, htmlRules);

  assert(!readClean.includes("heading-anchor-wrapper"), "read mode anchor wrappers should be stripped");
  assert(!readClean.includes('aria-label="Copy"'), "read mode anchor icon markup should be removed");
  assert(!readClean.includes(">Copy<"), "read mode heading copy text should be removed");

  const editSig = extractStructureSignature(editClean);
  const readSig = extractStructureSignature(readClean);
  assert.deepStrictEqual(readSig, editSig, "read and edit mode HTML should preserve equivalent block structure after preprocess");
}

function testExtensionFallbackScopeAndStructure() {
  const vm = require("vm");
  const extensionFallbackCode = fs.readFileSync(
    path.join(__dirname, "..", "converter", "plugins", "extensionFallback.js"),
    "utf8"
  );

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(extensionFallbackCode, sandbox);

  const register = sandbox.window.ConverterPluginModules?.extensionFallback?.register;
  assert.strictEqual(typeof register, "function", "extensionFallback register must be available");

  let fallbackRule;
  const fakeService = {
    addRule(_name, rule) {
      fallbackRule = rule;
    }
  };
  register(fakeService);
  assert(fallbackRule, "extensionFallback rule should be registered");

  function fakeNode(attrs = {}, textContent = "") {
    return {
      nodeType: 1,
      textContent,
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name);
      },
      getAttribute(name) {
        return attrs[name] ?? null;
      }
    };
  }

  const headingNode = fakeNode({ "data-prosemirror-node-name": "heading" }, "Interventions (System Defined)");
  const paragraphNode = fakeNode(
    { "data-prosemirror-node-name": "paragraph" },
    "Interventions represent explicit mitigation actions."
  );
  const listItemNode = fakeNode({ "data-prosemirror-node-name": "listItem" }, "Cancellation");

  assert.strictEqual(fallbackRule.filter(headingNode), false, "heading should not be swallowed by extension fallback");
  assert.strictEqual(fallbackRule.filter(paragraphNode), false, "paragraph should not be swallowed by extension fallback");
  assert.strictEqual(fallbackRule.filter(listItemNode), false, "list items should not be swallowed by extension fallback");

  assert.strictEqual(
    fallbackRule.filter(fakeNode({ "data-extension-key": "com.acme.chart" }, "Chart block")),
    true,
    "extension-key nodes should use extension fallback"
  );
  assert.strictEqual(
    fallbackRule.filter(fakeNode({ "data-prosemirror-node-name": "inlineExtension" }, "Inline widget")),
    true,
    "inlineExtension nodes should use extension fallback"
  );

  function renderNode(node) {
    if (fallbackRule.filter(node)) {
      return fallbackRule.replacement("", node);
    }

    const nodeName = node.getAttribute("data-prosemirror-node-name");
    if (nodeName === "heading") return `## ${node.textContent}`;
    if (nodeName === "paragraph") return node.textContent;
    if (nodeName === "listItem") return `- ${node.textContent}`;
    return node.textContent;
  }

  const rendered = [headingNode, paragraphNode, fakeNode({ "data-prosemirror-node-name": "heading" }, "Examples"), listItemNode]
    .map(renderNode)
    .join("\n\n");

  assert(rendered.includes("## Interventions (System Defined)"), "expected heading markers in markdown");
  assert(rendered.includes("## Examples"), "expected sub-heading markers in markdown");
  assert(rendered.includes("- Cancellation"), "expected list markers in markdown");
  assert(rendered.includes("\n\n"), "expected paragraph/list separation in markdown");
  assert.notStrictEqual(
    rendered.replace(/\n/g, ""),
    "Interventions (System Defined)Interventions represent explicit mitigation actions.ExamplesCancellation",
    "output should not collapse into one concatenated line"
  );
}


function run() {
  testRulesIndexLoads();
  testRuleOrderingMatchesLegacy();
  testLatexEasyMathRemoved();
  testMathMacroRegistration();
  testEscapedHtmlNormalization();
  testConfluenceModePreprocessParity();
  testExtensionFallbackScopeAndStructure();
  console.log("All tests passed.");
}

run();
