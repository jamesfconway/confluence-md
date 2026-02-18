(function (global) {
  function fallbackDetectHtmlMode(html) {
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

  function isReadModeNode(node) {
    const doc = node?.ownerDocument;
    if (!doc) return false;

    const detector = typeof global.detectHtmlMode === "function" ? global.detectHtmlMode : fallbackDetectHtmlMode;
    const html = doc.documentElement?.outerHTML || doc.body?.innerHTML || "";
    return detector(html) === "read mode HTML";
  }

  function hasTocStructure(node) {
    if (!node || node.nodeType !== 1) return false;
    const className = (node.getAttribute("class") || "").toLowerCase();
    const hasTocClass = /\btoc\b/.test(className) || className.includes("table-of-contents");
    const isNav = node.tagName?.toLowerCase() === "nav";
    const hasLinks = node.querySelectorAll("a").length > 0;
    const hasNestedList = node.querySelectorAll("ul li a").length > 0;
    return (hasTocClass || isNav) && hasLinks && hasNestedList;
  }

  function getDirectChild(node, tagName) {
    if (!node?.children) return null;
    const wanted = tagName.toUpperCase();
    for (let i = 0; i < node.children.length; i += 1) {
      if (node.children[i].tagName === wanted) return node.children[i];
    }
    return null;
  }

  function renderList(ulNode, level = 0) {
    if (!ulNode?.children?.length) return [];

    const lines = [];
    const indent = "  ".repeat(level);

    for (let i = 0; i < ulNode.children.length; i += 1) {
      const li = ulNode.children[i];
      if (li.tagName !== "LI") continue;

      const link = getDirectChild(li, "a") || li.querySelector("a");
      if (link) {
        const text = (link.textContent || "").replace(/\s+/g, " ").trim();
        const href = link.getAttribute("href") || "";
        if (text) lines.push(`${indent}- [${text}](${href})`);
      }

      const nested = getDirectChild(li, "ul");
      if (nested) lines.push(...renderList(nested, level + 1));
    }

    return lines;
  }

  function registerToc(service) {
    service.addRule("toc", {
      filter(node) {
        if (!isReadModeNode(node)) return false;
        return hasTocStructure(node);
      },
      replacement(_content, node) {
        const rootList = node.tagName === "UL" ? node : node.querySelector("ul");
        const lines = renderList(rootList, 0);
        if (!lines.length) return "";
        return `\n${lines.join("\n")}\n`;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.toc = { register: registerToc };
})(typeof self !== "undefined" ? self : window);
