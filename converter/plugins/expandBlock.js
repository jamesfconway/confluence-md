(function (global) {
  function registerExpandBlock(service) {
    service.addRule("expandBlock", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches('[data-node-type="expand"]') ||
          node.matches('[data-prosemirror-node-name="expand"]') ||
          node.matches('[data-node-type="nestedExpand"]') ||
          node.matches('[data-prosemirror-node-name="nestedExpand"]')
        );
      },
      replacement(content, node) {
        const title =
          node.getAttribute("data-title") ||
          node.getAttribute("title") ||
          "Expand";
        const isExpanded = node.getAttribute("data-expanded") !== "false";
        let innerMd = "";
        if (isExpanded) {
          const clone = node.cloneNode(true);
          clone
            .querySelectorAll('[id^="expand-title-"]')
            .forEach((el) => el.remove());
          clone
            .querySelectorAll('button[aria-labelledby]')
            .forEach((el) => el.remove());
          const innerHtml = clone.innerHTML || "";
          if (innerHtml.trim()) {
            innerMd = service.turndown(innerHtml).trim();
          }
        }

        const lines = [`(Expand Block - ${title})`];
        if (!isExpanded) {
          lines.push("*Block is collapsed*");
        } else if (innerMd) {
          lines.push(innerMd);
        }
        lines.push("(End Expand Block)");
        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.expandBlock = { register: registerExpandBlock };
})(typeof self !== "undefined" ? self : window);
