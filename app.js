const RULES_PATH = "rules.json";
const pasteArea = document.getElementById("pasteArea");
const htmlView = document.getElementById("htmlView");
const htmlHighlight = document.getElementById("htmlHighlight");
const markdownView = document.getElementById("markdownView");
const statusEl = document.getElementById("status");
const rulesArea = document.getElementById("rulesArea");
const rulesStatus = document.getElementById("rulesStatus");
const clearPasteBtn = document.getElementById("clearPaste");
const pasteFromClipboardBtn = document.getElementById("pasteFromClipboard");
const copyMarkdownButtons = document.querySelectorAll(".copy-markdown");
const includeLinksInput = document.getElementById("includeLinks");
const includeImagePlaceholdersInput = document.getElementById("includeImagePlaceholders");
const emojiNamesInput = document.getElementById("emojiNames");
const tabButtons = document.querySelectorAll(".tab");
const panels = {
  convert: document.getElementById("panel-convert"),
  settings: document.getElementById("panel-settings")
};

const converterService = Converter.createService();
let currentRules = { ...Converter.EMPTY_RULES };
let lastHtml = "";

const STORAGE_KEY = "converterOptions";

function renderMarkdown(optionsOverride = {}) {
  if (!lastHtml) return;
  const options = {
    includeLinks: includeLinksInput.checked,
    includeImagePlaceholders: includeImagePlaceholdersInput.checked,
    emojiNames: emojiNamesInput.checked,
    ...optionsOverride
  };
  const md = converterService.convertHtmlToMarkdown(lastHtml, currentRules, options);
  markdownView.value = md;
}

function setStatus(text) {
  statusEl.textContent = text;
}

async function persistOptions() {
  if (!chrome?.storage?.sync) return;
  const payload = {
    includeLinks: includeLinksInput.checked,
    includeImagePlaceholders: includeImagePlaceholdersInput.checked,
    emojiNames: emojiNamesInput.checked
  };
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: payload });
  } catch (err) {
    console.warn("Could not persist options", err);
  }
}

async function loadStoredOptions() {
  if (!chrome?.storage?.sync) return;
  try {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    const stored = result?.[STORAGE_KEY];
    if (!stored) return;
    includeLinksInput.checked = stored.includeLinks ?? includeLinksInput.checked;
    includeImagePlaceholdersInput.checked =
      stored.includeImagePlaceholders ?? includeImagePlaceholdersInput.checked;
    emojiNamesInput.checked = stored.emojiNames ?? emojiNamesInput.checked;
    converterService.setOptions(stored);
  } catch (err) {
    console.warn("Could not load stored options", err);
  }
}

async function loadRulesFromFile() {
  rulesArea.value = "Loading rules...";
  currentRules = await Converter.loadRules(RULES_PATH);
  rulesArea.value = JSON.stringify(currentRules, null, 2);
  rulesStatus.textContent = `Loaded rules from ${RULES_PATH}.`;
  setTimeout(() => (rulesStatus.textContent = ""), 2000);
}

function formatHtml(html) {
  if (!window.prettier || !window.prettierPlugins?.html) return html;
  try {
    return prettier.format(html, {
      parser: "html",
      plugins: [prettierPlugins.html],
      printWidth: 100
    });
  } catch (err) {
    console.warn("Could not format HTML", err);
    return html;
  }
}

function renderHtmlViews(html) {
  const formatted = formatHtml(html);
  if (htmlView) {
    htmlView.value = formatted;
  }
  if (htmlHighlight) {
    htmlHighlight.textContent = formatted;
    if (window.hljs?.highlightElement) {
      hljs.highlightElement(htmlHighlight);
    }
  }
}

async function readClipboardContent() {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          return blob.text();
        }
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          return blob.text();
        }
      }
    } catch (err) {
      console.warn("Could not read rich clipboard contents", err);
    }
  }

  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }

  throw new Error("Clipboard API unavailable");
}

function ingestHtml(html, sourceLabel = "") {
  if (!html) return;
  lastHtml = html;
  pasteArea.innerHTML = html;
  renderHtmlViews(html);
  renderMarkdown();
  setStatus(sourceLabel ? `Converted from ${sourceLabel}.` : "Converted.");
}

pasteArea.addEventListener("paste", (e) => {
  e.preventDefault();
  setStatus("");
  const html = e.clipboardData.getData("text/html");
  const plain = e.clipboardData.getData("text/plain");
  if (!html && !plain) {
    setStatus("No HTML/plain text on clipboard.");
    return;
  }
  const source = html || plain;
  ingestHtml(source, "clipboard");
});

pasteFromClipboardBtn?.addEventListener("click", async () => {
  setStatus("");
  try {
    const clipboardText = await readClipboardContent();
    if (!clipboardText) {
      setStatus("Clipboard is empty.");
      return;
    }
    ingestHtml(clipboardText, "clipboard");
  } catch (err) {
    console.warn("Clipboard read failed", err);
    setStatus("Clipboard access was denied or unavailable.");
  }
});

clearPasteBtn?.addEventListener("click", () => {
  pasteArea.innerHTML = "";
  htmlView.value = "";
  if (htmlHighlight) {
    htmlHighlight.textContent = "";
  }
  markdownView.value = "";
  lastHtml = "";
  setStatus("Cleared.");
});

copyMarkdownButtons.forEach((btn) =>
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(markdownView.value);
      setStatus("Markdown copied to clipboard.");
    } catch (err) {
      setStatus("Could not copy markdown.");
    }
  })
);

[includeLinksInput, includeImagePlaceholdersInput, emojiNamesInput].forEach((input) => {
  input?.addEventListener("change", () => {
    renderMarkdown();
    persistOptions();
  });
});

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

async function bootstrap() {
  await loadStoredOptions();
  await loadRulesFromFile();
  setStatus("Waiting for content…");
}

bootstrap();

if (chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "ingestHtml") {
      ingestHtml(message.html, message.source || "message");
      sendResponse?.({ ok: true });
      return true;
    }
    if (message?.type === "convertAndCopy") {
      const md = converterService.convertHtmlToMarkdown(
        message.html,
        currentRules,
        message.options || {}
      );
      navigator.clipboard
        .writeText(md)
        .then(() => sendResponse?.({ ok: true, markdown: md }))
        .catch(() => sendResponse?.({ ok: false, markdown: md }));
      return true;
    }
    return undefined;
  });
}
