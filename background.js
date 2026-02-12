importScripts(
  "https://unpkg.com/turndown/dist/turndown.js",
  "https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js",
  "converter/rules/loader.js",
  "converter/plugins/imagePlaceholder.js",
  "converter/plugins/expandBlock.js",
  "converter/plugins/panel.js",
  "converter/plugins/mentionPlaceholder.js",
  "converter/plugins/confluenceTable.js",
  "converter/plugins/extensionFallback.js",
  "converter/plugins/pluginLoader.js",
  "converter/pipeline/stages.js",
  "converter.js"
);
/* global Converter */
const RULES_URL = chrome.runtime.getURL("rules.json");
let rulesCache = null;
let converter = null;

async function ensureConverter() {
  if (converter) return converter;
  converter = Converter.createService();
  if (!rulesCache) {
    rulesCache = await Converter.loadRules(RULES_URL);
  }
  return converter;
}

async function getSelectionHtml(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) return "";
      const range = selection.getRangeAt(0).cloneContents();
      const div = document.createElement("div");
      div.appendChild(range);
      return div.innerHTML;
    }
  });
  return result || "";
}

async function copyTextOnPage(tabId, text) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      args: [text],
      func: async (payload) => {
        try {
          await navigator.clipboard.writeText(payload || "");
          return true;
        } catch (err) {
          console.error("Clipboard write failed", err);
          return false;
        }
      }
    });
    return true;
  } catch (err) {
    console.error("Clipboard injection failed", err);
    return false;
  }
}

async function handleCopyMarkdown(tabId) {
  const html = await getSelectionHtml(tabId);
  if (!html) return;
  const svc = await ensureConverter();
  const md = svc.convertHtmlToMarkdown(html, rulesCache || Converter.EMPTY_RULES, svc.getOptions());
  await copyTextOnPage(tabId, md);
}

async function handleCopyToSidebar(tabId) {
  const html = await getSelectionHtml(tabId);
  if (!html) return;
  await chrome.sidePanel.open({ tabId });
  await new Promise((resolve) => setTimeout(resolve, 150));
  await chrome.runtime.sendMessage({ type: "ingestHtml", html, source: "contextMenu" });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "copy-markdown",
      title: "Copy Markdown",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "copy-sidebar",
      title: "Copy to sidebar",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "copy-markdown") {
    await handleCopyMarkdown(tab.id);
  }
  if (info.menuItemId === "copy-sidebar") {
    await handleCopyToSidebar(tab.id);
  }
});
