(function (global) {
  const STRUCTURAL_PROSEMIRROR_NODES = new Set([
    "heading",
    "paragraph",
    "bulletList",
    "orderedList",
    "listItem",
    "blockquote",
    "codeBlock",
    "rule",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "media",
    "mediaSingle",
    "panel",
    "expand",
    "nestedExpand",
    "mention"
  ]);

  function isStructuralProseMirrorNode(node) {
    const nodeName = node?.getAttribute?.("data-prosemirror-node-name");
    return STRUCTURAL_PROSEMIRROR_NODES.has(nodeName);
  }

  function isExtensionLikeNode(node) {
    if (!node || node.nodeType !== 1) return false;

    const extensionNodeName = node.getAttribute("data-prosemirror-node-name");
    if (isStructuralProseMirrorNode(node)) {
      return false;
    }

    return (
      node.hasAttribute("data-extension-key") ||
      node.getAttribute("data-node-type") === "extension" ||
      extensionNodeName === "extension" ||
      extensionNodeName === "bodiedExtension" ||
      extensionNodeName === "inlineExtension"
    );
  }

  function registerExtensionFallback(service) {
    service.addRule("extensionFallback", {
      filter(node) {
        return isExtensionLikeNode(node);
      },
      replacement(content, node) {
        const visibleText = (node.textContent || "").replace(/\s+/g, " ").trim();
        return visibleText || "";
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.extensionFallback = {
    register: registerExtensionFallback
  };
})(typeof self !== "undefined" ? self : window);
