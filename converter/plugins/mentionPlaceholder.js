(function (global) {
  function registerMentionPlaceholder(service, context = {}) {
    const mentionState = context.mentionState || { map: new Map(), counter: 0 };

    service.addRule("mentionPlaceholder", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches('[data-prosemirror-node-name="mention"]') ||
          node.matches("[data-mention-id]")
        );
      },
      replacement(content, node) {
        const mentionId = node.getAttribute("data-mention-id");
        if (!mentionId) return "[User]";
        if (!mentionState.map.has(mentionId)) {
          mentionState.counter += 1;
          mentionState.map.set(mentionId, mentionState.counter);
        }
        const index = mentionState.map.get(mentionId);
        return `[User ${index}]`;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.mentionPlaceholder = {
    register: registerMentionPlaceholder
  };
})(typeof self !== "undefined" ? self : window);
