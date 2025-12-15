(function (global) {
  const EMPTY_RULES = { htmlPreprocessors: [], markdownPostprocessors: [] };
  const BLOCK_TAGS = new Set([
    "address",
    "article",
    "aside",
    "blockquote",
    "canvas",
    "dd",
    "div",
    "dl",
    "dt",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "noscript",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tfoot",
    "ul"
  ]);

  function defaultBaseUrl() {
    if (typeof location !== "undefined" && location.href) return location.href;
    return "";
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

  function createService({ baseUrl } = {}) {
    const options = {
      currentOptions: {
        includeLinks: true,
        includeImagePlaceholders: true,
        emojiNames: false
      },
      baseUrl: baseUrl || defaultBaseUrl()
    };

    let imageCounter = 0;

    function nextImageLabel() {
      imageCounter += 1;
      return `Image ${imageCounter}`;
    }

    function findMediaElement(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node.matches("img,[data-node-type=\\"media\\"],[data-prosemirror-node-name=\\"media\\"]")) {
        return node;
      }
      const descendant = node.querySelector(
        "img,[data-node-type=\\"media\\"],[data-prosemirror-node-name=\\"media\\"]"
      );
      if (descendant) return descendant;
      return node.closest(
        "img,[data-node-type=\\"media\\"],[data-prosemirror-node-name=\\"media\\"]"
      );
    }

    function mediaPlaceholder(node, opts) {
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

    function collapseWhitespace(text) {
      return text.replace(/\s+/g, " ");
    }

    function sanitizeText(text, inPre) {
      if (inPre) return text;
      return collapseWhitespace(text);
    }

    function renderInline(nodes, ctx) {
      let out = "";
      for (const child of nodes) {
        out += convertNode(child, { ...ctx, inline: true });
      }
      return out;
    }

    function renderList(listNode, ctx, ordered = false) {
      const items = Array.from(listNode.children).filter((c) => c.tagName === "LI");
      let idx = 1;
      const lines = [];
      const indent = "  ".repeat(ctx.listDepth || 0);
      for (const item of items) {
        const marker = ordered ? `${idx}. ` : "- ";
        const body = convertNode(item, {
          ...ctx,
          listDepth: (ctx.listDepth || 0) + 1,
          inline: false
        })
          .trim()
          .split(/\n/);
        if (!body.length) continue;
        const firstLine = indent + marker + (body[0] || "");
        const rest = body
          .slice(1)
          .map((line) => indent + " ".repeat(marker.length) + line);
        lines.push([firstLine, ...rest].join("\n"));
        idx += 1;
      }
      return lines.join("\n") + "\n\n";
    }

    function tableToMarkdown(table, ctx) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (!rows.length) return "";

      function cellToMarkdown(cell) {
        const md = convertNode(cell, { ...ctx, inline: true }).trim();
        if (!md) return " ";
        return md
          .replace(/\r/g, "")
          .replace(/\n{2,}/g, "\n")
          .replace(/\n- /g, "<br>• ")
          .replace(/\n/g, "<br>")
          .replace(/\s+/g, " ")
          .trim();
      }

      let headerRowIndex = rows.findIndex((row) =>
        Array.from(row.children).some((c) => c.tagName === "TH")
      );
      if (headerRowIndex === -1) headerRowIndex = 0;

      const headerRow = rows[headerRowIndex];
      const headerCells = Array.from(headerRow.children)
        .filter((c) => c.tagName === "TH" || c.tagName === "TD")
        .map(cellToMarkdown);

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
          .map(cellToMarkdown);
        while (cells.length < colCount) cells.push("");
        if (cells.length > colCount) cells.length = colCount;
        lines.push("| " + cells.join(" | ") + " |");
      });

      return "\n\n" + lines.join("\n") + "\n\n";
    }

    function convertNode(node, ctx = { inline: false, listDepth: 0, inPre: false }) {
      if (!node) return "";
      if (node.nodeType === Node.TEXT_NODE) {
        return sanitizeText(node.textContent || "", ctx.inPre);
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const tag = node.tagName.toLowerCase();
      const isBlock = BLOCK_TAGS.has(tag) && !ctx.inline;

      switch (tag) {
        case "br":
          return "\n";
        case "hr":
          return "\n---\n\n";
        case "em":
        case "i":
          return `*${renderInline(node.childNodes, ctx)}*`;
        case "strong":
        case "b":
          return `**${renderInline(node.childNodes, ctx)}**`;
        case "code":
          if (ctx.inPre) return node.textContent || "";
          return "`" + (node.textContent || "").replace(/`/g, "\\`") + "`";
        case "a": {
          const text = renderInline(node.childNodes, ctx) || node.getAttribute("href") || "";
          const href = node.getAttribute("href") || "";
          if (!href || !options.currentOptions.includeLinks) return text;
          return `[${text}](${href})`;
        }
        case "img":
        case "svg":
        case "picture":
        case "figure":
          return mediaPlaceholder(node, options.currentOptions);
        case "pre": {
          const content = node.textContent || "";
          return "```\n" + content.replace(/\n$/, "") + "\n```\n\n";
        }
        case "blockquote": {
          const inner = convertNode(node, { ...ctx, inline: false, listDepth: 0 });
          const lines = inner
            .trim()
            .split(/\n/)
            .map((line) => "> " + line);
          return lines.join("\n") + "\n\n";
        }
        case "ul":
          return renderList(node, ctx, false);
        case "ol":
          return renderList(node, ctx, true);
        case "li": {
          const content = renderInline(node.childNodes, { ...ctx, inline: false }).trim();
          return content || "";
        }
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6": {
          const level = parseInt(tag.replace("h", ""), 10) || 1;
          const hashes = "#".repeat(Math.min(level, 6));
          return `${hashes} ${renderInline(node.childNodes, ctx).trim()}\n\n`;
        }
        case "table":
          return tableToMarkdown(node, ctx);
        case "p":
        case "div":
        case "section":
        case "article":
        case "main":
        case "header":
        case "footer":
        case "nav":
          return renderInline(node.childNodes, ctx).trim() + (isBlock ? "\n\n" : "");
        default:
          if (isBlock) {
            return renderInline(node.childNodes, ctx).trim() + "\n\n";
          }
          return renderInline(node.childNodes, ctx);
      }
    }

    function domToMarkdown(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const parts = Array.from(doc.body.childNodes).map((child) =>
        convertNode(child, { inline: false, listDepth: 0, inPre: false })
      );
      return parts.join("")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    function convertHtmlToMarkdown(html, rules, overrideOptions) {
      if (!html) return "";
      const mergedOptions = { ...options.currentOptions, ...overrideOptions };
      options.currentOptions = mergedOptions;

      const activeRules = rules || EMPTY_RULES;
      const preprocessed = applyRegexRules(html, activeRules.htmlPreprocessors || []);

      let md = "";
      try {
        md = domToMarkdown(preprocessed);
      } catch (err) {
        console.error("Conversion error:", err);
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
