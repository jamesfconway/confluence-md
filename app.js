const RULES_PATH = "rules/index.json";
const pasteArea = document.getElementById("pasteArea");
const htmlView = document.getElementById("htmlView");
const htmlHighlight = document.getElementById("htmlHighlight");
const markdownView = document.getElementById("markdownView");
const statusEl = document.getElementById("status");
const markdownFeedback = document.getElementById("markdownFeedback");
const clearPasteBtn = document.getElementById("clearPaste");
const pasteFromClipboardBtn = document.getElementById("pasteFromClipboard");
const copyMarkdownBtn = document.getElementById("copyMarkdown");
const copyDebugBundleBtn = document.getElementById("copyDebugBundle");
const copyHtmlBtn = document.getElementById("copyHtml");
const includeLinksInput = document.getElementById("includeLinks");
const includeImagePlaceholdersInput = document.getElementById("includeImagePlaceholders");
const emojiNamesInput = document.getElementById("emojiNames");

const converterService = Converter.createService();
let currentRules = { ...Converter.EMPTY_RULES };
let lastHtml = "";
let inlineFeedbackTimeout;

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

function setInlineFeedback(text, state = "") {
  if (!markdownFeedback) return;
  markdownFeedback.textContent = text;
  markdownFeedback.dataset.state = state;
  clearTimeout(inlineFeedbackTimeout);
  if (text) {
    inlineFeedbackTimeout = setTimeout(() => {
      markdownFeedback.textContent = "";
      markdownFeedback.dataset.state = "";
    }, 2500);
  }
}

function resetFeedback() {
  setInlineFeedback("");
  setStatus("");
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
  currentRules = await Converter.loadRules(RULES_PATH);
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

function detectHtmlMode(html) {
  if (typeof html !== "string" || !html) return "";
  if (/data-prosemirror-node-name=/.test(html) || /data-pm-slice=/.test(html)) {
    return "edit mode HTML";
  }
  if (/heading-anchor-wrapper/.test(html) || /data-renderer-start-pos=/.test(html)) {
    return "read mode HTML";
  }
  if (/<\/?[a-zA-Z][\w:-]*(?:\s|>)/.test(html)) {
    return "HTML";
  }
  return "plain text";
}

async function readClipboardContent() {
  if (navigator.clipboard?.read) {
    try {
      const items = await navigator.clipboard.read();

      for (const item of items) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          return { text: await blob.text(), mimeType: "text/html" };
        }
      }

      for (const item of items) {
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          return { text: await blob.text(), mimeType: "text/plain" };
        }
      }
    } catch (err) {
      console.warn("Could not read rich clipboard contents", err);
    }
  }

  if (navigator.clipboard?.readText) {
    return { text: await navigator.clipboard.readText(), mimeType: "text/plain" };
  }

  throw new Error("Clipboard API unavailable");
}

async function ingestFromClipboard(sourceLabel = "clipboard") {
  resetFeedback();
  try {
    const { text: clipboardText, mimeType } = await readClipboardContent();
    if (!clipboardText) {
      setStatus("Clipboard is empty.");
      setInlineFeedback("Clipboard is empty.", "error");
      return;
    }
    ingestHtml(clipboardText, sourceLabel, mimeType);
  } catch (err) {
    console.warn("Clipboard read failed", err);
    setStatus("Clipboard access was denied or unavailable.");
    setInlineFeedback("Paste failed. Try keyboard paste.", "error");
  }
}

function ingestHtml(html, sourceLabel = "", mimeType = "") {
  if (!html) return;
  lastHtml = html;
  pasteArea.innerHTML = html;
  renderHtmlViews(html);
  renderMarkdown();

  const sourceBits = [];
  if (sourceLabel) sourceBits.push(`from ${sourceLabel}`);
  if (mimeType) sourceBits.push(`(${mimeType})`);
  const mode = detectHtmlMode(html);
  if (mode) sourceBits.push(`detected ${mode}`);

  setStatus(sourceBits.length ? `Converted ${sourceBits.join(" ")}.` : "Converted.");
}

pasteArea.addEventListener("paste", async (e) => {
  e.preventDefault();
  resetFeedback();
  const html = e.clipboardData?.getData("text/html");
  const plain = e.clipboardData?.getData("text/plain");

  if (html || plain) {
    const payload = html || plain;
    const mimeType = html ? "text/html" : "text/plain";
    ingestHtml(payload, "clipboard", mimeType);
    return;
  }

  await ingestFromClipboard("clipboard");
});

pasteFromClipboardBtn?.addEventListener("click", () => ingestFromClipboard("clipboard"));

clearPasteBtn?.addEventListener("click", () => {
  pasteArea.innerHTML = "";
  htmlView.value = "";
  if (htmlHighlight) {
    htmlHighlight.textContent = "";
  }
  markdownView.value = "";
  lastHtml = "";
  setStatus("Cleared.");
  setInlineFeedback("");
});

async function copyTextToClipboard(textValue, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textValue);
      setStatus(successMessage);
      setInlineFeedback("Copied to clipboard.", "success");
      return true;
    }
  } catch (err) {
    console.warn("Clipboard write failed", err);
  }

  const temp = document.createElement("textarea");
  temp.value = textValue;
  temp.setAttribute("readonly", "readonly");
  temp.style.position = "absolute";
  temp.style.left = "-9999px";
  document.body.appendChild(temp);
  temp.select();
  try {
    const ok = document.execCommand?.("copy");
    document.body.removeChild(temp);
    if (ok) {
      setStatus(successMessage);
      setInlineFeedback("Copied. Use Ctrl/Cmd+V to paste.", "success");
      return true;
    }
  } catch (err) {
    console.warn("Fallback copy failed", err);
  }

  if (temp.parentNode) {
    document.body.removeChild(temp);
  }

  setStatus("Could not copy. Clipboard unavailable.");
  setInlineFeedback("Copy failed. Use Ctrl/Cmd+C.", "error");
  return false;
}

async function copyMarkdown() {
  if (!markdownView) return false;
  return copyTextToClipboard(markdownView.value, "Markdown copied to clipboard.");
}

async function copyHtml() {
  if (!htmlView) return false;
  return copyTextToClipboard(htmlView.value, "Raw HTML copied to clipboard.");
}

function buildDebugBundle() {
  const html = htmlView?.value || "";
  const markdown = markdownView?.value || "";
  return [
    "# Input HTML",
    "```html",
    html,
    "```",
    "",
    "---",
    "# Markdown output",
    "```md",
    markdown,
    "```"
  ].join("\n");
}

async function copyDebugBundle() {
  return copyTextToClipboard(buildDebugBundle(), "Debug HTML + Markdown copied to clipboard.");
}

copyMarkdownBtn?.addEventListener("click", copyMarkdown);
copyDebugBundleBtn?.addEventListener("click", copyDebugBundle);
copyHtmlBtn?.addEventListener("click", copyHtml);

[includeLinksInput, includeImagePlaceholdersInput, emojiNamesInput].forEach((input) => {
  input?.addEventListener("change", () => {
    renderMarkdown();
    persistOptions();
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
