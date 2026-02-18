(function (global) {
  function formatDate(timestampValue) {
    const ts = Number.parseInt(timestampValue, 10);
    if (!Number.isFinite(ts)) return "";
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC"
    }).format(date);
  }

  function resolveMentionToken(mentionNode, mentionState) {
    if (!mentionNode || !mentionState) return "";
    const mentionId = mentionNode.getAttribute("data-mention-id");
    if (!mentionId) return "";

    if (!mentionState.map.has(mentionId)) {
      mentionState.counter += 1;
      mentionState.map.set(mentionId, mentionState.counter);
    }

    const index = mentionState.map.get(mentionId);
    return `[User ${index}]`;
  }

  function stripDecorativeContent(html) {
    if (!html) return "";
    return html
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<span[^>]*aria-hidden=\"true\"[^>]*>[\s\S]*?<\/span>/gi, "")
      .trim();
  }

  function registerTaskList(service, context = {}) {
    const mentionState = context.mentionState || { map: new Map(), counter: 0 };

    service.addRule("taskList", {
      filter(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
          node.matches('[data-prosemirror-node-name="taskItem"]') ||
          node.hasAttribute("data-task-local-id")
        );
      },
      replacement(_content, node) {
        const isEditModeTask = node.matches('[data-prosemirror-node-name="taskItem"]');

        const isDone = isEditModeTask
          ? (node.getAttribute("data-task-state") || "").toUpperCase() === "DONE"
          : Boolean(node.querySelector('input[type="checkbox"]')?.checked);

        const contentNode = isEditModeTask
          ? node.querySelector("div.task-item")
          : node.querySelector('div[data-component="content"]');

        const mentionNode = node.querySelector("[data-mention-id]");
        const mentionToken = resolveMentionToken(mentionNode, mentionState);

        const dateNode = node.querySelector('[data-node-type="date"]');
        const dueDateLabel = dateNode ? formatDate(dateNode.getAttribute("data-timestamp")) : "";

        let taskHtml = contentNode?.innerHTML || "";
        if (mentionNode) {
          const mentionHtml = mentionNode.outerHTML || "";
          taskHtml = taskHtml.replace(mentionHtml, " ");
        }
        if (dateNode) {
          const dateHtml = dateNode.outerHTML || "";
          taskHtml = taskHtml.replace(dateHtml, " ");
        }

        taskHtml = stripDecorativeContent(taskHtml);
        const taskText = taskHtml ? service.turndown(taskHtml).replace(/\s+/g, " ").trim() : "";

        const parts = [taskText];
        if (mentionToken) parts.push(mentionToken);
        if (dueDateLabel) parts.push(`by ${dueDateLabel}`);

        return `\n- [${isDone ? "x" : " "}] ${parts.join(" ").trim()}\n`;
      }
    });
  }

  global.ConverterPluginModules = global.ConverterPluginModules || {};
  global.ConverterPluginModules.taskList = { register: registerTaskList };
})(typeof self !== "undefined" ? self : window);
