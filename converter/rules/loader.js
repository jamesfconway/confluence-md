(function (global) {
  const EMPTY_RULES = { htmlPreprocessors: [], markdownPostprocessors: [] };

  function ensureRuleShape(rule, sourceLabel) {
    const required = ["id", "description", "pattern", "replacement"];
    for (const field of required) {
      if (!(field in rule)) {
        throw new Error(`Rule in ${sourceLabel} missing required field: ${field}`);
      }
    }
    if (rule.flags !== undefined && typeof rule.flags !== "string") {
      throw new Error(`Rule ${rule.id} in ${sourceLabel} has non-string flags`);
    }
    try {
      new RegExp(rule.pattern, rule.flags || "g");
    } catch (err) {
      throw new Error(`Rule ${rule.id} in ${sourceLabel} has invalid regex: ${err.message}`);
    }
  }

  function assertDeterministicOrdering(fileList, phaseLabel) {
    let previous = -1;
    fileList.forEach((file) => {
      const match = /\/(\d+)-/.exec(file) || /^(\d+)-/.exec(file);
      if (!match) {
        throw new Error(`Rules file for ${phaseLabel} is missing numeric prefix: ${file}`);
      }
      const value = Number(match[1]);
      if (value <= previous) {
        throw new Error(`Rules file ordering for ${phaseLabel} is not strictly increasing at ${file}`);
      }
      previous = value;
    });
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
    return res.json();
  }

  function normalizeRule(rule) {
    return {
      description: rule.description,
      pattern: rule.pattern,
      replacement: rule.replacement,
      flags: rule.flags || "g"
    };
  }

  function extractRulesFromFilePayload(payload, sourcePath) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.rules)) return payload.rules;
    if (payload && typeof payload === "object") return [payload];
    throw new Error(`Rules file ${sourcePath} must be an object, array, or { rules: [] }`);
  }

  function addValidatedRules(target, payload, seenIds, sourcePath) {
    const rules = extractRulesFromFilePayload(payload, sourcePath);
    rules.forEach((rule, index) => {
      const sourceLabel = `${sourcePath}#${index + 1}`;
      ensureRuleShape(rule, sourceLabel);
      if (seenIds.has(rule.id)) {
        throw new Error(`Duplicate rule id detected: ${rule.id}`);
      }
      seenIds.add(rule.id);
      if (rule.enabled !== false) target.push(normalizeRule(rule));
    });
  }

  async function loadSplitRules(indexPath) {
    const index = await fetchJson(indexPath);
    const htmlFiles = index?.htmlPreprocessors;
    const markdownFiles = index?.markdownPostprocessors;
    if (!Array.isArray(htmlFiles) || !Array.isArray(markdownFiles)) {
      throw new Error("Rules index must include htmlPreprocessors and markdownPostprocessors arrays");
    }

    assertDeterministicOrdering(htmlFiles, "htmlPreprocessors");
    assertDeterministicOrdering(markdownFiles, "markdownPostprocessors");

    const seenIds = new Set();
    const htmlPreprocessors = [];
    for (const path of htmlFiles) {
      const payload = await fetchJson(path);
      addValidatedRules(htmlPreprocessors, payload, seenIds, path);
    }

    const markdownPostprocessors = [];
    for (const path of markdownFiles) {
      const payload = await fetchJson(path);
      addValidatedRules(markdownPostprocessors, payload, seenIds, path);
    }

    return { htmlPreprocessors, markdownPostprocessors };
  }

  async function loadRules(rulesPath) {
    try {
      const data = await fetchJson(rulesPath);

      if (Array.isArray(data?.htmlPreprocessors) && Array.isArray(data?.markdownPostprocessors)) {
        const htmlIsLegacy = data.htmlPreprocessors.every((entry) => entry && typeof entry === "object" && "pattern" in entry);
        const markdownIsLegacy = data.markdownPostprocessors.every((entry) => entry && typeof entry === "object" && "pattern" in entry);
        if (htmlIsLegacy && markdownIsLegacy) {
          return data;
        }
        const htmlIsSplit = data.htmlPreprocessors.every((entry) => typeof entry === "string");
        const markdownIsSplit = data.markdownPostprocessors.every((entry) => typeof entry === "string");
        if (htmlIsSplit && markdownIsSplit) {
          return loadSplitRules(rulesPath);
        }
      }

      throw new Error("Rules file must be legacy rule arrays or split index arrays");
    } catch (err) {
      console.error("Could not load rules configuration; conversion will omit custom rules.", err);
      return { ...EMPTY_RULES };
    }
  }

  global.ConverterRules = {
    EMPTY_RULES,
    loadRules,
    loadSplitRules,
    ensureRuleShape,
    assertDeterministicOrdering,
    extractRulesFromFilePayload
  };
})(typeof self !== "undefined" ? self : window);
