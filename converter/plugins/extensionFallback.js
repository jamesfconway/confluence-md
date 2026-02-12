(function (global) {
  function registerExtensionFallback(service) {
    service.addRule("extensionFallback", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.hasAttribute("data-extension-key") ||
          node.hasAttribute("data-prosemirror-node-name")
        );
      },
      replacement(content, node) {
        const visibleText = (node.textContent || "").replace(/\s+/g, " ").trim();
        return visibleText;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.extensionFallback = {
    register: registerExtensionFallback
  };
})(typeof self !== "undefined" ? self : window);
