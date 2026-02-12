(function (global) {
  function registerPanel(service) {
    service.addRule("panel", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches('[data-prosemirror-node-name="panel"]') ||
          node.matches("[data-panel-type]")
        );
      },
      replacement(content, node) {
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
          node.querySelector('[data-panel-content="true"]') || node;
        const innerHtml = contentNode.innerHTML || "";
        const innerMd = innerHtml.trim() ? service.turndown(innerHtml).trim() : "";

        const lines = [`(${startLabel})`];
        if (innerMd) lines.push(innerMd);
        lines.push("(Panel End)");
        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.panel = { register: registerPanel };
})(typeof self !== "undefined" ? self : window);
