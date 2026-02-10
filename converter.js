(function (global) {
  const EMPTY_RULES = { htmlPreprocessors: [], markdownPostprocessors: [] };

  function defaultBaseUrl() {
    if (typeof location !== "undefined" && location.href) return location.href;
    return "";
  }

  function addImagePlaceholderRule(service, options) {
    const MEDIA_ELEMENT_SELECTOR =
      "img,[data-node-type=\"media\"],[data-prosemirror-node-name=\"media\"]";
    const MEDIA_WRAPPER_SELECTOR =
      "[data-prosemirror-node-name=\"mediaSingle\"],[data-node-type=\"mediaSingle\"],.mediaSingleView-content-wrap";
    const MEDIA_ANY_SELECTOR = `${MEDIA_ELEMENT_SELECTOR},${MEDIA_WRAPPER_SELECTOR}`;

    function findMediaElement(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node.matches(MEDIA_ELEMENT_SELECTOR)) return node;
      const descendant = node.querySelector(MEDIA_ELEMENT_SELECTOR);
      if (descendant) return descendant;
      return node.closest(MEDIA_ELEMENT_SELECTOR);
    }

    let imageCounter = 0;
    function nextImageLabel() {
      imageCounter += 1;
      return `Image ${imageCounter}`;
    }

    service.addRule("imagePlaceholder", {
      filter: function (node) {
        if (!node || node.nodeType !== 1) return false;
        if (!node.matches(MEDIA_ANY_SELECTOR)) return false;

        const ancestorMedia = node.parentElement?.closest(MEDIA_ANY_SELECTOR);
        const closestMedia = node.closest(MEDIA_ANY_SELECTOR);
        return closestMedia === node && !ancestorMedia;
      },
      replacement: function (content, node) {
        const opts = options.currentOptions || {};
        const mediaNode = findMediaElement(node) || node;
        const alt =
          mediaNode.getAttribute("alt") ||
          mediaNode.getAttribute("data-alt") ||
          mediaNode.getAttribute("data-file-name") ||
          "";
        const src = mediaNode.getAttribute("src") || "";
        const emojiShort = mediaNode.getAttribute("data-emoji-short-name") || "";

        let isEmoji = false;
        try {
          if (alt) {
            isEmoji = /\p{Extended_Pictographic}/u.test(alt) || alt.length <= 3;
          }
        } catch (e) {
          isEmoji = alt && alt.length <= 3;
        }
        if (!isEmoji && emojiShort) {
          isEmoji = true;
        }

        if (isEmoji) {
          if (!opts.emojiNames) return "";
          const name = emojiShort || alt || "emoji";
          return `:${name}:`;
        }

        if (!opts.includeImagePlaceholders) return "";

        if (src) {
          try {
            const url = new URL(src, options.baseUrl || defaultBaseUrl());
            const parts = url.pathname.split("/");
            const filename = parts[parts.length - 1] || "";
            if (filename && !alt) {
              mediaNode.setAttribute("data-file-name", filename);
            }
          } catch (e) {
            const filename = src.split("/").pop() || "";
            if (filename && !alt) {
              mediaNode.setAttribute("data-file-name", filename);
            }
          }
        }

        const label = nextImageLabel();
        return `[${label}]`;
      }
    });
  }

  function applyRegexRules(text, rules = []) {
    let out = text;
    for (const r of rules) {
      try {
        const re = new RegExp(r.pattern, r.flags || "g");
        out = out.replace(re, r.replacement);
      } catch (err) {
        console.error("Bad rule", r, err);
      }
    }
    return out;
  }

  function addExpandRule(service) {
    service.addRule("expandBlock", {
      filter: function (node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches("[data-node-type=\"expand\"]") ||
          node.matches("[data-prosemirror-node-name=\"expand\"]") ||
          node.matches("[data-node-type=\"nestedExpand\"]") ||
          node.matches("[data-prosemirror-node-name=\"nestedExpand\"]")
        );
      },
      replacement: function (content, node) {
        const title =
          node.getAttribute("data-title") ||
          node.getAttribute("title") ||
          "Expand";
        const isExpanded = node.getAttribute("data-expanded") !== "false";
        let innerMd = "";
        if (isExpanded) {
          const clone = node.cloneNode(true);
          clone
            .querySelectorAll("[id^=\"expand-title-\"]")
            .forEach((el) => el.remove());
          clone
            .querySelectorAll("button[aria-labelledby]")
            .forEach((el) => el.remove());
          const innerHtml = clone.innerHTML || "";
          if (innerHtml.trim()) {
            innerMd = service.turndown(innerHtml).trim();
          }
        }

        const lines = [`(Expand Block - ${title})`];
        if (!isExpanded) {
          lines.push("*Block is collapsed*");
        } else if (innerMd) {
          lines.push(innerMd);
        }
        lines.push("(End Expand Block)");
        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });
  }

  function createService({ baseUrl } = {}) {
    const service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });
    if (typeof turndownPluginGfm !== "undefined" && turndownPluginGfm?.gfm) {
      service.use(turndownPluginGfm.gfm);
    }

    const options = {
      currentOptions: {
        includeLinks: true,
        includeImagePlaceholders: true,
        emojiNames: false
      },
      baseUrl: baseUrl || defaultBaseUrl()
    };
    const mentionState = {
      map: new Map(),
      counter: 0
    };

    addImagePlaceholderRule(service, options);

    function parseExtensionParameters(node) {
      const raw = node.getAttribute("data-parameters");
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn("Failed to parse macro data-parameters JSON", err);
        return null;
      }
    }

    function getLatexFromParameters(params) {
      const macroParams = params?.macroParams;
      if (!macroParams) return "";

      return (
        macroParams.body?.value ||
        macroParams.__bodyContent?.value ||
        ""
      )
        .toString()
        .trim();
    }

    function isLatexExtensionNode(node) {
      if (!node || node.nodeType !== 1) return false;
      if (node.getAttribute("data-extension-type") !== "com.atlassian.confluence.macro.core") {
        return false;
      }

      const key = (node.getAttribute("data-extension-key") || "").toLowerCase();
      return key === "easy-math-block" || key === "easy-math-block-l" || key === "easy-math-inline" || key === "eazy-math-inline";
    }

    service.addRule("latexMacros", {
      filter: function (node) {
        return isLatexExtensionNode(node);
      },
      replacement: function (content, node) {
        const key = (node.getAttribute("data-extension-key") || "").toLowerCase();
        const params = parseExtensionParameters(node);
        const latex = getLatexFromParameters(params);
        if (!latex) return "";

        if (key === "easy-math-inline" || key === "eazy-math-inline") {
          return `$${latex}$`;
        }

        return `\n\n$$\n${latex}\n$$\n\n`;
      }
    });

    service.addRule("panel", {
      filter: function (node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches("[data-prosemirror-node-name=\"panel\"]") ||
          node.matches("[data-panel-type]")
        );
      },
      replacement: function (content, node) {
        const panelType = node.getAttribute("data-panel-type");
        const icon =
          node.getAttribute("data-panel-icon") ||
          node.getAttribute("data-panel-icon-text");
        const panelTypeLabels = {
          info: "Info",
          warning: "Warning",
          error: "Error",
          success: "Success",
          note: "Note"
        };
        const normalizeLabel = (value) => {
          if (!value) return "";
          return value
            .toString()
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/\b\w/g, (char) => char.toUpperCase());
        };

        let startLabel = "";
        if (panelType && panelType !== "custom") {
          startLabel = `${panelTypeLabels[panelType] || normalizeLabel(panelType)} Panel Start`;
        } else {
          const iconLabel = normalizeLabel(icon) || "Custom";
          startLabel = `${iconLabel} Custom Panel Start`;
        }

        const contentNode =
          node.querySelector("[data-panel-content=\"true\"]") || node;
        const innerHtml = contentNode.innerHTML || "";
        const innerMd = innerHtml.trim() ? service.turndown(innerHtml).trim() : "";

        const lines = [`(${startLabel})`];
        if (innerMd) lines.push(innerMd);
        lines.push("(Panel End)");
        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });
    service.addRule("mentionPlaceholder", {
      filter: function (node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches("[data-prosemirror-node-name=\"mention\"]") ||
          node.matches("[data-mention-id]")
        );
      },
      replacement: function (content, node) {
        const mentionId = node.getAttribute("data-mention-id");
        if (!mentionId) return "[User]";
        if (!mentionState.map.has(mentionId)) {
          mentionState.counter += 1;
          mentionState.map.set(mentionId, mentionState.counter);
        }
        const index = mentionState.map.get(mentionId);
        return `[User ${index}]`;
      }
    });

    addExpandRule(service);

    service.addRule("confluenceTable", {
      filter: "table",
      replacement: function (content, node) {
        const cellTd = new TurndownService({
          headingStyle: "atx",
          bulletListMarker: "-",
          codeBlockStyle: "fenced"
        });
        if (typeof turndownPluginGfm !== "undefined" && turndownPluginGfm?.gfm) {
          cellTd.use(turndownPluginGfm.gfm);
        }
        addImagePlaceholderRule(cellTd, options);
        addExpandRule(cellTd);

        function cellMarkdown(cell) {
          const html = cell.innerHTML || "";
          let md = cellTd.turndown(html);
          md = md
            .replace(/\r/g, "")
            .replace(/\n{2,}/g, "\n")
            .replace(/\n- /g, "<br>• ")
            .replace(/\n/g, "<br>")
            .replace(/\s+/g, " ")
            .trim();
          return md || " ";
        }

        const rows = Array.from(node.querySelectorAll("tr"));
        if (!rows.length) return "";

        let headerRowIndex = rows.findIndex((row) =>
          Array.from(row.children).some((c) => c.tagName === "TH")
        );
        if (headerRowIndex === -1) headerRowIndex = 0;

        const headerRow = rows[headerRowIndex];
        const headerCells = Array.from(headerRow.children)
          .filter((c) => c.tagName === "TH" || c.tagName === "TD")
          .map(cellMarkdown);

        if (!headerCells.length) return "";

        const colCount = headerCells.length;
        const lines = [];
        lines.push("| " + headerCells.join(" | ") + " |");
        const sep = Array(colCount).fill("---");
        lines.push("| " + sep.join(" | ") + " |");

        rows.forEach((row, idx) => {
          if (idx === headerRowIndex) return;
          const cells = Array.from(row.children)
            .filter((c) => c.tagName === "TH" || c.tagName === "TD")
            .map(cellMarkdown);
          while (cells.length < colCount) cells.push("");
          if (cells.length > colCount) cells.length = colCount;
          lines.push("| " + cells.join(" | ") + " |");
        });

        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });

    function convertHtmlToMarkdown(html, rules, overrideOptions) {
      if (!html) return "";
      const mergedOptions = { ...options.currentOptions, ...overrideOptions };
      options.currentOptions = mergedOptions;
      mentionState.map = new Map();
      mentionState.counter = 0;

      const activeRules = rules || EMPTY_RULES;
      const preprocessed = applyRegexRules(html, activeRules.htmlPreprocessors || []);

      let md = "";
      try {
        md = service.turndown(preprocessed);
      } catch (err) {
        console.error("Turndown error:", err);
        md = "Error converting HTML to Markdown:\n" + err;
      }

      md = applyRegexRules(md, activeRules.markdownPostprocessors || []);

      if (!mergedOptions.includeLinks) {
        md = md.replace(
          /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)/g,
          (match) => {
            if (match.startsWith("!")) return match;
            return match.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1");
          }
        );
      }

      return md.trim() + "\n";
    }

    return {
      convertHtmlToMarkdown,
      EMPTY_RULES,
      applyRegexRules,
      getOptions: () => ({ ...options.currentOptions }),
      setOptions: (opts) => {
        options.currentOptions = { ...options.currentOptions, ...opts };
      }
    };
  }

  async function loadRules(rulesUrl) {
    try {
      const res = await fetch(rulesUrl, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.htmlPreprocessors || !data.markdownPostprocessors) {
        throw new Error("Rules file missing preprocessors/postprocessors");
      }
      return data;
    } catch (err) {
      console.error("Could not load rules.json; conversion will omit custom rules.", err);
      return { ...EMPTY_RULES };
    }
  }

  global.Converter = { createService, EMPTY_RULES, loadRules, applyRegexRules };
})(typeof self !== "undefined" ? self : window);
