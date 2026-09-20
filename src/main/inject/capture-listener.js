/**
 * Injected into career pages to detect manual edits on text fields.
 * Posts messages to the preload bridge via console.log prefix (picked up by webview).
 */
(function () {
  const PREFIX = "__HUNTBOARD_FIELD__:";
  function getPrompt(el) {
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria.trim();
    const parent = el.closest("div, fieldset, li");
    const legend = parent?.querySelector("legend, label, .label");
    if (legend?.textContent) return legend.textContent.trim();
    return el.name || el.placeholder || "Unknown question";
  }

  function onChange(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement))
      return;
    if (el.type === "hidden" || el.type === "password") return;
    const value = el.value?.trim();
    if (!value || value.length < 8) return;
    const payload = {
      prompt: getPrompt(el),
      value,
      url: location.href,
      maxLength: el.maxLength > 0 ? el.maxLength : undefined,
    };
    console.log(PREFIX + JSON.stringify(payload));
  }

  document.addEventListener(
    "focusout",
    (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
        onChange(t);
      }
    },
    true
  );
})();
