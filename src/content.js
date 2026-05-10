// Content script for Moodle quiz review pages. `lib/moodle.js` is loaded
// before this script (see manifest.json content_scripts) and exposes
// MoodleGrader on globalThis.

(function () {
  "use strict";
  const { findQuestions } = globalThis.MoodleGrader || {};
  if (!findQuestions) {
    console.warn("[MoodleGrader] moodle.js helpers missing — content script aborted.");
    return;
  }

  function questionByslot(slot) {
    const all = findQuestions(document, location.href);
    return all.find((q) => q.slot === slot) || null;
  }

  async function fetchImageAsDataUrl(src) {
    // Same-origin images on the Moodle session can only be fetched from this
    // page context (the service worker has no Moodle cookies).
    const res = await fetch(src, { credentials: "include" });
    if (!res.ok) throw new Error(`image fetch ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        if (msg?.type === "listQuestions") {
          const list = findQuestions(document, location.href).map((q) => ({
            slot: q.slot,
            type: q.type,
            qtextPlain: q.qtextPlain,
            subQuestions: q.subQuestions,
            maxMark: q.maxMark,
            currentMark: q.currentMark,
            hasImages: q.images.length > 0,
            studentResponse: q.studentResponse,
            overrideUrl: q.overrideUrl
          }));
          sendResponse({ ok: true, questions: list, url: location.href });
          return;
        }

        if (msg?.type === "extractSlot") {
          const q = questionByslot(msg.slot);
          if (!q) { sendResponse({ ok: false, error: `Slot ${msg.slot} not found.` }); return; }
          let imageDataUrls = [];
          if (msg.includeImages !== false && q.images.length) {
            for (const im of q.images.slice(0, 4)) {
              try { imageDataUrls.push(await fetchImageAsDataUrl(im.src)); }
              catch (e) { console.warn("[MoodleGrader] image fetch failed", im.src, e); }
            }
          }
          sendResponse({ ok: true, question: q, imageDataUrls });
          return;
        }

        sendResponse({ ok: false, error: `Unknown message type: ${msg?.type}` });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  });
})();
