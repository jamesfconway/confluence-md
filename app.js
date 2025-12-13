const RULES_PATH = "rules.json";

const pasteArea = document.getElementById("pasteArea");
const htmlView = document.getElementById("htmlView");
const markdownView = document.getElementById("markdownView");
const statusEl = document.getElementById("status");
const rulesArea = document.getElementById("rulesArea");
const rulesStatus = document.getElementById("rulesStatus");

const clearPasteBtn = document.getElementById("clearPaste");
const copyMarkdownBtn = document.getElementById("copyMarkdown");

const includeLinksInput = document.getElementById("includeLinks");
const includeImagePlaceholdersInput =
  document.getElementById("includeImagePlaceholders");
const emojiNamesInput = document.getElementById("emojiNames");

const tabButtons = document.querySelectorAll(".tab");
const panels = {
  convert: document.getElementById("panel-convert"),
  settings: document.getElementById("panel-settings")
};

const paneLeft = document.getElementById("paneLeft");
const resizer = document.getElementById("resizer");

let currentOptions = {
  includeLinks: true,
  includeImagePlaceholders: true,
  emojiNames: false
};

let imageCounter = 0;
function resetImageCounter() {
  imageCounter = 0;
}

function nextImageLabel() {
  imageCounter += 1;
  return `Image ${imageCounter}`;
}

function addImagePlaceholderRule(service) {
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

  service.addRule("imagePlaceholder", {
    filter: function (node) {
      if (!node || node.nodeType !== 1) return false;
      if (!node.matches(MEDIA_ANY_SELECTOR)) return false;

      const ancestorMedia = node.parentElement?.closest(MEDIA_ANY_SELECTOR);
      const closestMedia = node.closest(MEDIA_ANY_SELECTOR);
      return closestMedia === node && !ancestorMedia;
    },
    replacement: function (content, node) {
      const opts = currentOptions || {};
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
          const url = new URL(src, window.location.href);
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

const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced"
});
if (window.turndownPluginGfm) {
  turndownService.use(turndownPluginGfm.gfm);
}
addImagePlaceholderRule(turndownService);

// Custom table rule: normalise Confluence tables to clean GFM tables
turndownService.addRule("confluenceTable", {
  filter: "table",
  replacement: function (content, node) {
    // Use a separate Turndown instance for cell contents
    const cellTd = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });
    if (window.turndownPluginGfm) {
      cellTd.use(turndownPluginGfm.gfm);
    }
    addImagePlaceholderRule(cellTd);

    // Convert a single TH/TD cell to one-line markdown
    function cellMarkdown(cell) {
      const html = cell.innerHTML || "";
      let md = cellTd.turndown(html);

      // Collapse list items and paragraphs into a single line
      md = md
        .replace(/\r/g, "")
        .replace(/\n{2,}/g, "\n")
        .replace(/\n- /g, "<br>• ") // preserve bullet items with visible markers
        .replace(/\n/g, "<br>") // preserve line breaks safely using <br>
        .replace(/\s+/g, " ")
        .trim();

      return md || " ";
    }

    const rows = Array.from(node.querySelectorAll("tr"));
    if (!rows.length) return "";

    // Find header row: first row that has a TH, otherwise first row
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

    // Header line
    lines.push("| " + headerCells.join(" | ") + " |");

    // Separator line
    const sep = Array(colCount).fill("---");
    lines.push("| " + sep.join(" | ") + " |");

    // Data rows
    rows.forEach((row, idx) => {
      if (idx === headerRowIndex) return; // skip header row

      const cells = Array.from(row.children)
        .filter((c) => c.tagName === "TH" || c.tagName === "TD")
        .map(cellMarkdown);

      // Pad or truncate to header column count
      while (cells.length < colCount) cells.push("");
      if (cells.length > colCount) cells.length = colCount;

      lines.push("| " + cells.join(" | ") + " |");
    });

    // Surround table with blank lines so it doesn't glue to paragraphs/headings
    return "\n\n" + lines.join("\n") + "\n\n";
  }
});

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

const EMPTY_RULES = { htmlPreprocessors: [], markdownPostprocessors: [] };

function convertHtmlToMarkdown(html, rules, options) {
  if (!html) return "";
  currentOptions = { ...currentOptions, ...options };
  resetImageCounter();

  const activeRules = rules || EMPTY_RULES;

  const preprocessed = applyRegexRules(html, activeRules.htmlPreprocessors || []);

  let md = "";
  try {
    md = turndownService.turndown(preprocessed);
  } catch (err) {
    console.error("Turndown error:", err);
    md = "Error converting HTML to Markdown:\n" + err;
  }

  md = applyRegexRules(md, activeRules.markdownPostprocessors || []);

  if (!options.includeLinks) {
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

let currentRules = structuredClone(EMPTY_RULES);
rulesArea.value = "Loading rules...";
let lastHtml = "";

function updateRulesView(sourceLabel = "") {
  rulesArea.value = JSON.stringify(currentRules, null, 2);
  if (sourceLabel) {
    rulesStatus.textContent = `Loaded rules from ${sourceLabel}.`;
    setTimeout(() => (rulesStatus.textContent = ""), 2000);
  }
}

async function loadRulesFromFile() {
  try {
    const res = await fetch(RULES_PATH, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.htmlPreprocessors || !data.markdownPostprocessors) {
      throw new Error("Rules file missing preprocessors/postprocessors");
    }
    currentRules = data;
    updateRulesView(RULES_PATH);
  } catch (err) {
    console.error("Could not load rules.json; conversion will omit custom rules.", err);
    currentRules = structuredClone(EMPTY_RULES);
    rulesStatus.textContent = "rules.json missing or unreadable; running without custom rules.";
    setTimeout(() => (rulesStatus.textContent = ""), 4000);
    updateRulesView("built-in defaults removed");
  }
}

function recomputeFromCurrent() {
  if (!lastHtml) return;
  const options = {
    includeLinks: includeLinksInput.checked,
    includeImagePlaceholders: includeImagePlaceholdersInput.checked,
    emojiNames: emojiNamesInput.checked
  };
  const md = convertHtmlToMarkdown(lastHtml, currentRules, options);
  markdownView.value = md;
}

pasteArea.addEventListener("paste", (e) => {
  e.preventDefault();
  statusEl.textContent = "";

  const html = e.clipboardData.getData("text/html");
  const plain = e.clipboardData.getData("text/plain");

  if (!html && !plain) {
    statusEl.textContent = "No HTML/plain text on clipboard.";
    return;
  }

  const source = html || plain;
  lastHtml = source;

  pasteArea.innerHTML = html || plain;
  htmlView.value = html || "<!-- no text/html on clipboard -->\n" + plain;

  recomputeFromCurrent();
  statusEl.textContent = "Converted from clipboard HTML.";
});

clearPasteBtn.addEventListener("click", () => {
  pasteArea.innerHTML = "";
  htmlView.value = "";
  markdownView.value = "";
  lastHtml = "";
  statusEl.textContent = "Cleared.";
});

copyMarkdownBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(markdownView.value);
    statusEl.textContent = "Markdown copied to clipboard.";
  } catch (err) {
    statusEl.textContent = "Could not copy markdown.";
  }
});

includeLinksInput.addEventListener("change", recomputeFromCurrent);
includeImagePlaceholdersInput.addEventListener("change", recomputeFromCurrent);
emojiNamesInput.addEventListener("change", recomputeFromCurrent);

rulesArea.readOnly = true;

loadRulesFromFile();

// Tab navigation
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    Object.entries(panels).forEach(([name, el]) => {
      el.classList.toggle("active", name === target);
    });
  });
});

let isResizing = false;
let startX = 0;
let startWidth = 0;

resizer.addEventListener("mousedown", (e) => {
  isResizing = true;
  startX = e.clientX;
  startWidth = paneLeft.getBoundingClientRect().width;
  document.body.style.cursor = "col-resize";
  e.preventDefault();
});

window.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  const dx = e.clientX - startX;
  let newWidth = startWidth + dx;
  if (newWidth < 220) newWidth = 220;
  if (newWidth > 600) newWidth = 600;
  paneLeft.style.width = newWidth + "px";
});

window.addEventListener("mouseup", () => {
  if (!isResizing) return;
  isResizing = false;
  document.body.style.cursor = "";
});
