(function (global) {
  function createService({ baseUrl } = {}) {
    const service = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced"
    });

    if (typeof turndownPluginGfm !== "undefined" && turndownPluginGfm?.gfm) {
      service.use(turndownPluginGfm.gfm);
    }

    const optionsRef = {
      currentOptions: {
        includeLinks: true,
        includeImagePlaceholders: true,
        emojiNames: false
      },
      baseUrl: baseUrl || global.ConverterPlugins.defaultBaseUrl()
    };

    const mentionState = {
      map: new Map(),
      counter: 0
    };

    const pluginOrder = global.ConverterPlugins.registerDefaultPlugins(service, {
      optionsRef,
      mentionState
    });

    function convertHtmlToMarkdown(html, rules, overrideOptions) {
      if (!html) return "";

      optionsRef.currentOptions = {
        ...optionsRef.currentOptions,
        ...overrideOptions
      };

      mentionState.map = new Map();
      mentionState.counter = 0;

      const activeRules = rules || global.ConverterRules.EMPTY_RULES;

      const result = global.ConverterPipeline.runConversionPipeline({
        html,
        rules: activeRules,
        options: optionsRef.currentOptions,
        service
      });

      return result.markdown;
    }

    return {
      convertHtmlToMarkdown,
      getOptions: () => ({ ...optionsRef.currentOptions }),
      setOptions: (opts) => {
        optionsRef.currentOptions = { ...optionsRef.currentOptions, ...opts };
      },
      getPluginOrder: () => [...pluginOrder]
    };
  }

  global.Converter = {
    createService,
    EMPTY_RULES: global.ConverterRules.EMPTY_RULES,
    loadRules: global.ConverterRules.loadRules,
    applyRegexRules: global.ConverterPipeline.applyRegexRules
  };
})(typeof self !== "undefined" ? self : window);
