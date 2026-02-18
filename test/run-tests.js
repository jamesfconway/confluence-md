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
    path.join(__dirname, "..", "converter", "plugins", "taskList.js"),
    path.join(__dirname, "..", "converter", "plugins", "toc.js"),
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



function testTaskListPlugin() {
  const vm = require("vm");
  const mentionCode = fs.readFileSync(path.join(__dirname, "..", "converter", "plugins", "mentionPlaceholder.js"), "utf8");
  const taskCode = fs.readFileSync(path.join(__dirname, "..", "converter", "plugins", "taskList.js"), "utf8");

  const sandbox = { window: {}, console, Intl, Date };
  vm.createContext(sandbox);
  vm.runInContext(mentionCode, sandbox);
  vm.runInContext(taskCode, sandbox);

  const registerTask = sandbox.window.ConverterPluginModules?.taskList?.register;
  assert.strictEqual(typeof registerTask, "function", "taskList plugin should register");

  let taskRule;
  const fakeService = {
    addRule(name, rule) {
      if (name === "taskList") taskRule = rule;
    },
    turndown(html) {
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  };

  const mentionState = { map: new Map(), counter: 0 };
  registerTask(fakeService, { mentionState });
  assert(taskRule, "taskList rule should be defined");

  function makeNode({ attrs = {}, taskItemHtml = "", contentHtml = "", mentionId = "", dateTs = "", checked = false, isEdit = true }) {
    const mentionNode = mentionId
      ? {
          getAttribute(name) {
            return name === "data-mention-id" ? mentionId : null;
          },
          outerHTML: `<span data-mention-id="${mentionId}"></span>`
        }
      : null;

    const dateNode = dateTs
      ? {
          getAttribute(name) {
            return name === "data-timestamp" ? String(dateTs) : null;
          },
          outerHTML: `<span data-node-type="date" data-timestamp="${dateTs}">Today</span>`
        }
      : null;

    const checkboxNode = checked ? { checked: true } : null;

    return {
      nodeType: 1,
      matches(selector) {
        return selector === '[data-prosemirror-node-name="taskItem"]' ? isEdit : false;
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attrs, name);
      },
      getAttribute(name) {
        return attrs[name] ?? null;
      },
      querySelector(selector) {
        if (selector === "div.task-item" && isEdit) return { innerHTML: taskItemHtml };
        if (selector === 'div[data-component="content"]' && !isEdit) return { innerHTML: contentHtml };
        if (selector === "[data-mention-id]") return mentionNode;
        if (selector === '[data-node-type="date"]') return dateNode;
        if (selector === 'input[type="checkbox"]') return checkboxNode;
        return null;
      }
    };
  }

  const ts = Date.UTC(2026, 1, 20);

  const editNoExtras = makeNode({
    attrs: { "data-task-state": "TODO" },
    taskItemHtml: "Write docs",
    isEdit: true
  });
  assert.strictEqual(taskRule.filter(editNoExtras), true, "edit mode tasks should match filter");
  assert.strictEqual(taskRule.replacement("", editNoExtras).trim(), "- [ ] Write docs", "edit task without mention/date should render");

  const editWithMention = makeNode({
    attrs: { "data-task-state": "TODO" },
    taskItemHtml: 'Assign <span data-mention-id="u-1"></span>',
    mentionId: "u-1",
    isEdit: true
  });
  assert.strictEqual(taskRule.replacement("", editWithMention).trim(), "- [ ] Assign [User 1]", "edit task mention should render");

  const editWithDate = makeNode({
    attrs: { "data-task-state": "DONE" },
    taskItemHtml: 'Finish <span data-node-type="date" data-timestamp="' + ts + '">Today</span>',
    dateTs: ts,
    isEdit: true
  });
  assert.strictEqual(taskRule.replacement("", editWithDate).trim(), "- [x] Finish by 20 Feb 2026", "edit task date should render from timestamp");

  const readWithBoth = makeNode({
    attrs: { "data-task-local-id": "task-1" },
    contentHtml: 'Review <span data-mention-id="u-1"></span> <span data-node-type="date" data-timestamp="' + ts + '">Today</span>',
    mentionId: "u-1",
    dateTs: ts,
    checked: true,
    isEdit: false
  });
  assert.strictEqual(taskRule.filter(readWithBoth), true, "read mode tasks should match filter");
  assert.strictEqual(taskRule.replacement("", readWithBoth).trim(), "- [x] Review [User 1] by 20 Feb 2026", "read task with mention/date should render");

  const readNoExtras = makeNode({
    attrs: { "data-task-local-id": "task-2" },
    contentHtml: "Simple read task",
    checked: false,
    isEdit: false
  });
  assert.strictEqual(taskRule.replacement("", readNoExtras).trim(), "- [ ] Simple read task", "read task without mention/date should render");
}

function testTocPluginReadMode() {
  const vm = require("vm");
  const tocCode = fs.readFileSync(path.join(__dirname, "..", "converter", "plugins", "toc.js"), "utf8");

  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(tocCode, sandbox);

  const registerToc = sandbox.window.ConverterPluginModules?.toc?.register;
  assert.strictEqual(typeof registerToc, "function", "toc plugin should register");

  let tocRule;
  registerToc({
    addRule(name, rule) {
      if (name === "toc") tocRule = rule;
    }
  });

  function anchor(text, href) {
    return {
      textContent: text,
      getAttribute(name) {
        return name === "href" ? href : null;
      }
    };
  }

  function li({ link, nested = null }) {
    const children = [];
    if (link) children.push({ tagName: "A", ...link });
    if (nested) children.push(nested);
    return {
      tagName: "LI",
      children,
      querySelector(selector) {
        if (selector === "a") {
          return children.find((c) => c.tagName === "A") || null;
        }
        return null;
      }
    };
  }

  function ul(items) {
    return {
      tagName: "UL",
      children: items
    };
  }

  const nestedList = ul([li({ link: anchor("Child", "#child") })]);
  const rootList = ul([
    li({ link: anchor("Intro", "#intro") }),
    li({ link: anchor("Section", "#section"), nested: nestedList })
  ]);

  const tocNode = {
    nodeType: 1,
    tagName: "NAV",
    ownerDocument: {
      documentElement: { outerHTML: '<div data-renderer-start-pos="1"><nav class="toc"></nav></div>' },
      body: { innerHTML: '<div data-renderer-start-pos="1"></div>' }
    },
    getAttribute(name) {
      return name === "class" ? "ak-renderer-toc" : null;
    },
    querySelectorAll(selector) {
      if (selector === "a") return [1, 2, 3];
      if (selector === "ul li a") return [1, 2, 3];
      return [];
    },
    querySelector(selector) {
      if (selector === "ul") return rootList;
      return null;
    }
  };

  assert.strictEqual(tocRule.filter(tocNode), true, "read mode toc should match filter");
  assert.strictEqual(
    tocRule.replacement("", tocNode).trim(),
    "- [Intro](#intro)\n- [Section](#section)\n  - [Child](#child)",
    "toc should render nested markdown list"
  );

  const nonReadNode = { ...tocNode, ownerDocument: { documentElement: { outerHTML: '<div data-prosemirror-node-name="heading"></div>' } } };
  assert.strictEqual(tocRule.filter(nonReadNode), false, "toc should not run in edit mode");
}

function run() {
  testRulesIndexLoads();
  testRuleOrderingMatchesLegacy();
  testLatexEasyMathRemoved();
  testMathMacroRegistration();
  testEscapedHtmlNormalization();
  testConfluenceModePreprocessParity();
  testTaskListPlugin();
  testTocPluginReadMode();
  testExtensionFallbackScopeAndStructure();
  console.log("All tests passed.");
}

run();
