(function (global) {
  function registerExtensionFallback(service) {
    service.addRule("extensionFallback", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;

        const nodeName = node.getAttribute("data-prosemirror-node-name");
        return (
          node.hasAttribute("data-extension-key") ||
          node.getAttribute("data-node-type") === "extension" ||
          nodeName === "extension" ||
          nodeName === "inlineExtension" ||
          nodeName === "bodiedExtension"
        );
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
