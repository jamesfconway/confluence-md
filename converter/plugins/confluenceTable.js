(function (global) {
  function registerConfluenceTable(service, context = {}) {
    const modules = global.ConverterPluginModules || {};
    const imagePlaceholderModule = modules.imagePlaceholder;
    const expandBlockModule = modules.expandBlock;

    if (!imagePlaceholderModule?.register || !expandBlockModule?.register) {
      throw new Error(
        "confluenceTable plugin requires imagePlaceholder and expandBlock plugin modules to be loaded first"
      );
    }

    service.addRule("confluenceTable", {
      filter: "table",
      replacement(content, node) {
        const cellTd = new TurndownService({
          headingStyle: "atx",
          bulletListMarker: "-",
          codeBlockStyle: "fenced"
        });
        if (typeof turndownPluginGfm !== "undefined" && turndownPluginGfm?.gfm) {
          cellTd.use(turndownPluginGfm.gfm);
        }

        imagePlaceholderModule.register(cellTd, context);
        expandBlockModule.register(cellTd, context);

        function cellMarkdown(cell) {
          const html = cell.innerHTML || "";
          let md = cellTd.turndown(html);
          md = md
            .replace(/\r/g, "")
            .replace(/\n{2,}/g, "\n")
            .replace(/\n- /g, "<br>• ")
            .replace(/\n/g, "<br>")
            .replace(/\s+/g, " ")
            .trim();
          return md || " ";
        }

        const rows = Array.from(node.querySelectorAll("tr"));
        if (!rows.length) return "";

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
        lines.push("| " + headerCells.join(" | ") + " |");
        const sep = Array(colCount).fill("---");
        lines.push("| " + sep.join(" | ") + " |");

        rows.forEach((row, idx) => {
          if (idx === headerRowIndex) return;
          const cells = Array.from(row.children)
            .filter((c) => c.tagName === "TH" || c.tagName === "TD")
            .map(cellMarkdown);
          while (cells.length < colCount) cells.push("");
          if (cells.length > colCount) cells.length = colCount;
          lines.push("| " + cells.join(" | ") + " |");
        });

        return "\n\n" + lines.join("\n") + "\n\n";
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.confluenceTable = { register: registerConfluenceTable };
})(typeof self !== "undefined" ? self : window);
