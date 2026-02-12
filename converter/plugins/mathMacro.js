(function (global) {
  function registerMathMacro(service, context = {}) {
    const debugEnabled = !!context?.debug?.mathMacro;

    function debugLog(message, details) {
      if (!debugEnabled || typeof console === "undefined") return;
      console.log(`[mathMacro] ${message}`, details || "");
    }

    function decodeEntities(value) {
      if (!value || typeof value !== "string") return value;
      if (typeof document === "undefined") return value;
      const textarea = document.createElement("textarea");
      textarea.innerHTML = value;
      return textarea.value;
    }

    function parseMacroParameters(attrValue) {
      if (!attrValue || typeof attrValue !== "string") {
        debugLog("parse status", { ok: false, reason: "missing-attribute" });
        return null;
      }
      try {
        const parsed = JSON.parse(attrValue);
        debugLog("parse status", { ok: true, mode: "direct" });
        return parsed;
      } catch (error) {
        try {
          const parsed = JSON.parse(decodeEntities(attrValue));
          debugLog("parse status", { ok: true, mode: "entity-decoded" });
          return parsed;
        } catch (entityError) {
          debugLog("parse status", { ok: false, reason: "json-parse-failed" });
          return null;
        }
      }
    }

    function resolveMacroType(element) {
      if (!element || element.nodeType !== 1) return { inline: false, block: false, macroName: "", dataVc: "" };

      const macroName =
        element.getAttribute("data-macro-name") ||
        element.closest("[data-macro-name]")?.getAttribute("data-macro-name") ||
        element.querySelector("[data-macro-name]")?.getAttribute("data-macro-name") ||
        "";
      const dataVc =
        element.getAttribute("data-vc") ||
        element.closest("[data-vc]")?.getAttribute("data-vc") ||
        element.querySelector("[data-vc]")?.getAttribute("data-vc") ||
        "";

      const inline =
        macroName === "eazy-math-inline" ||
        dataVc.includes("legacy-macro-element_eazy-math-inline") ||
        dataVc.includes("_eazy-math-inline");
      const block =
        macroName === "easy-math-block" ||
        dataVc.includes("legacy-macro-element_easy-math-block") ||
        dataVc.includes("_easy-math-block");

      debugLog("macro type", { inline, block, macroName, dataVc });
      return { inline, block, macroName, dataVc };
    }

    service.addRule("mathMacro", {
      filter(node) {
        if (!node || node.nodeType !== 1 || !node.hasAttribute("data-macro-parameters")) return false;

        const { inline, block } = resolveMacroType(node);
        const matched = inline || block;
        debugLog("host selection", {
          found: matched,
          tag: node.tagName,
          hasParams: true,
          macroName: node.getAttribute("data-macro-name") || ""
        });
        return matched;
      },
      replacement(content, node) {
        const params = parseMacroParameters(node.getAttribute("data-macro-parameters") || "");
        const latexRaw = params?.body;
        if (typeof latexRaw !== "string") {
          debugLog("body extraction", { length: 0, hasBody: false });
          return "";
        }

        const latex = latexRaw.replace(/\\/g, "\\").trim();
        debugLog("body extraction", { length: latex.length, hasBody: !!latex });
        if (!latex) return "";

        const { inline, block } = resolveMacroType(node);
        if (inline && !block) return latex;
        if (block) return `\n\n${latex}\n\n`;
        return latex;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.mathMacro = {
    register: registerMathMacro
  };
})(typeof self !== "undefined" ? self : window);
