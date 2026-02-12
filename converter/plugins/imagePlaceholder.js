(function (global) {
  function defaultBaseUrl() {
    if (typeof location !== "undefined" && location.href) return location.href;
    return "";
  }

  function registerImagePlaceholder(service, context = {}) {
    const options = context.optionsRef || {};
    const MEDIA_ELEMENT_SELECTOR =
      'img,[data-node-type="media"],[data-prosemirror-node-name="media"]';
    const MEDIA_WRAPPER_SELECTOR =
      '[data-prosemirror-node-name="mediaSingle"],[data-node-type="mediaSingle"],.mediaSingleView-content-wrap';
    const MEDIA_ANY_SELECTOR = `${MEDIA_ELEMENT_SELECTOR},${MEDIA_WRAPPER_SELECTOR}`;

    function findMediaElement(node) {
      if (!node || node.nodeType !== 1) return null;
      if (node.matches(MEDIA_ELEMENT_SELECTOR)) return node;
      const descendant = node.querySelector(MEDIA_ELEMENT_SELECTOR);
      if (descendant) return descendant;
      return node.closest(MEDIA_ELEMENT_SELECTOR);
    }

    let imageCounter = 0;
    function nextImageLabel() {
      imageCounter += 1;
      return `Image ${imageCounter}`;
    }

    service.addRule("imagePlaceholder", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        if (!node.matches(MEDIA_ANY_SELECTOR)) return false;

        const ancestorMedia = node.parentElement?.closest(MEDIA_ANY_SELECTOR);
        const closestMedia = node.closest(MEDIA_ANY_SELECTOR);
        return closestMedia === node && !ancestorMedia;
      },
      replacement(content, node) {
        const opts = options.currentOptions || {};
        const mediaNode = findMediaElement(node) || node;
        const alt =
          mediaNode.getAttribute("alt") ||
          mediaNode.getAttribute("data-alt") ||
          mediaNode.getAttribute("data-file-name") ||
          "";
        const src = mediaNode.getAttribute("src") || "";
        const emojiShort = mediaNode.getAttribute("data-emoji-short-name") || "";

        let isEmoji = false;
        try {
          if (alt) {
            isEmoji = /\p{Extended_Pictographic}/u.test(alt) || alt.length <= 3;
          }
        } catch (e) {
          isEmoji = alt && alt.length <= 3;
        }
        if (!isEmoji && emojiShort) {
          isEmoji = true;
        }

        if (isEmoji) {
          if (!opts.emojiNames) return "";
          const name = emojiShort || alt || "emoji";
          return `:${name}:`;
        }

        if (!opts.includeImagePlaceholders) return "";

        if (src) {
          try {
            const url = new URL(src, options.baseUrl || defaultBaseUrl());
            const parts = url.pathname.split("/");
            const filename = parts[parts.length - 1] || "";
            if (filename && !alt) {
              mediaNode.setAttribute("data-file-name", filename);
            }
          } catch (e) {
            const filename = src.split("/").pop() || "";
            if (filename && !alt) {
              mediaNode.setAttribute("data-file-name", filename);
            }
          }
        }

        const label = nextImageLabel();
        return `[${label}]`;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.imagePlaceholder = {
    register: registerImagePlaceholder,
    defaultBaseUrl
  };
})(typeof self !== "undefined" ? self : window);
