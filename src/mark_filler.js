// Runs on Moodle's "Make comment or override mark" popup (comment.php).
// Reads the pending {mark, comment} that the side panel stashed in
// chrome.storage.session and pre-fills the form. Never auto-submits — the
// human always clicks Save themselves.

(async function () {
  "use strict";
  const key = "pending:" + location.search;
  let pending;
  try {
    const all = await chrome.storage.session.get(key);
    pending = all[key];
  } catch (e) {
    console.warn("[MoodleGrader] could not read pending mark", e);
    return;
  }
  if (!pending) return;

  // Discard stashed values older than 10 minutes — avoids surprise refills if
  // the popup is reopened later.
  if (Date.now() - (pending.ts || 0) > 10 * 60 * 1000) {
    chrome.storage.session.remove(key).catch(() => {});
    return;
  }

  function setMark() {
    const markEl = document.querySelector('input[name="mark"], #id_mark');
    if (!markEl) return false;
    if (typeof pending.mark === "number" && !isNaN(pending.mark)) {
      markEl.value = String(pending.mark);
      markEl.dispatchEvent(new Event("input", { bubbles: true }));
      markEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  function setComment() {
    if (!pending.comment) return;
    // Plain textarea fallback (Moodle "plain text" editor).
    const ta = document.querySelector('textarea[name="comment[text]"], #id_commenteditor');
    if (ta && !ta.value) {
      ta.value = pending.comment;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    // TinyMCE / Atto editors live inside iframes — best-effort fill.
    document.querySelectorAll("iframe").forEach((f) => {
      try {
        const fdoc = f.contentDocument;
        if (!fdoc) return;
        const body = fdoc.querySelector("body[contenteditable='true'], #tinymce");
        if (body && !body.textContent.trim()) {
          body.innerHTML = pending.comment.replace(/\n/g, "<br>");
        }
      } catch (_) { /* cross-origin iframe — skip */ }
    });
  }

  // Highlight the Save button so the grader knows what to click next.
  function highlightSave() {
    const btn = document.querySelector('input[type="submit"], button[type="submit"]');
    if (!btn) return;
    btn.style.outline = "3px solid #2ea44f";
    btn.style.outlineOffset = "2px";
  }

  function showBanner() {
    const banner = document.createElement("div");
    banner.textContent = "Moodle Grader: mark prefilled. Review, then click Save.";
    Object.assign(banner.style, {
      position: "fixed", top: "0", left: "0", right: "0",
      background: "#fff8c5", color: "#54470a", padding: "8px 12px",
      borderBottom: "1px solid #d4a72c", fontFamily: "system-ui, sans-serif",
      fontSize: "13px", zIndex: "99999"
    });
    document.body.appendChild(banner);
  }

  // Some Moodle themes finish rendering after document_idle; retry briefly.
  let tries = 0;
  const t = setInterval(() => {
    const ok = setMark();
    if (ok || ++tries > 20) {
      clearInterval(t);
      if (ok) {
        setComment();
        highlightSave();
        showBanner();
        chrome.storage.session.remove(key).catch(() => {});
      }
    }
  }, 150);
})();
