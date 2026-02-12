(function (global) {
  function defaultBaseUrl() {
    return global.ConverterPluginModules.imagePlaceholder.defaultBaseUrl();
  }

  const DEFAULT_PLUGIN_ORDER = Object.freeze([
    { id: "imagePlaceholder", order: 10 },
    { id: "mentionPlaceholder", order: 20 },
    { id: "expandBlock", order: 30 },
    { id: "panel", order: 40 },
    { id: "confluenceTable", order: 50 },
    { id: "extensionFallback", order: 60 }
  ]);

  function registerDefaultPlugins(service, context) {
    const ordered = [...DEFAULT_PLUGIN_ORDER].sort((a, b) => a.order - b.order);
    ordered.forEach(({ id }) => {
      const pluginModule = global.ConverterPluginModules[id];
      if (!pluginModule?.register) {
        throw new Error(`Missing plugin module: ${id}`);
      }
      pluginModule.register(service, context);
    });
    return ordered.map(({ id, order }) => ({ id, order }));
  }

  global.ConverterPlugins = {
    registerDefaultPlugins,
    DEFAULT_PLUGIN_ORDER,
    defaultBaseUrl
  };
})(typeof self !== "undefined" ? self : window);
