(function (global) {
  function applyRegexRules(text, rules = []) {
    let out = text;
    for (const r of rules) {
      try {
        const re = new RegExp(r.pattern, r.flags || "g");
        out = out.replace(re, r.replacement);
      } catch (err) {
        console.error("Bad rule", r, err);
      }
    }
    return out;
  }

  function stageLoadInput(ctx) {
    return { ...ctx, html: ctx.html || "" };
  }

  function stageHtmlPreprocess(ctx) {
    const html = applyRegexRules(ctx.html, ctx.rules.htmlPreprocessors || []);
    return { ...ctx, html };
  }

  function stageParseToDom(ctx) {
    return { ...ctx, parsedHtml: ctx.html };
  }

  function stageRenderMarkdown(ctx) {
    let markdown = "";
    try {
      markdown = ctx.service.turndown(ctx.parsedHtml || "");
    } catch (err) {
      console.error("Turndown error:", err);
      markdown = "Error converting HTML to Markdown:\n" + err;
    }
    return { ...ctx, markdown };
  }

  function stageMarkdownPostprocess(ctx) {
    const markdown = applyRegexRules(ctx.markdown, ctx.rules.markdownPostprocessors || []);
    return { ...ctx, markdown };
  }

  function stageFinalizeOutput(ctx) {
    let markdown = ctx.markdown;
    if (!ctx.options.includeLinks) {
      markdown = markdown.replace(
        /!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)/g,
        (match) => {
          if (match.startsWith("!")) return match;
          return match.replace(/^\[([^\]]+)\]\([^)]+\)$/, "$1");
        }
      );
    }
    return { ...ctx, markdown: markdown.trim() + "\n" };
  }

  function runConversionPipeline(context) {
    const stages = [
      stageLoadInput,
      stageHtmlPreprocess,
      stageParseToDom,
      stageRenderMarkdown,
      stageMarkdownPostprocess,
      stageFinalizeOutput
    ];

    return stages.reduce((ctx, stage) => stage(ctx), context);
  }

  global.ConverterPipeline = {
    applyRegexRules,
    runConversionPipeline,
    stageLoadInput,
    stageHtmlPreprocess,
    stageParseToDom,
    stageRenderMarkdown,
    stageMarkdownPostprocess,
    stageFinalizeOutput
  };
})(typeof self !== "undefined" ? self : window);
