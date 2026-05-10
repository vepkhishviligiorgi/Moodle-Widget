// Service worker. Routes messages between the side panel and content scripts,
// and is the only place the OpenAI key/API call lives.

import { gradeQuestion } from "./lib/openai.js";

const SETTINGS_KEYS = ["apiKey", "model", "systemPrompt", "sendImages"];
const CONTENT_FILES = ["src/lib/moodle.js", "src/content.js"];

async function getSettings() {
  const out = await chrome.storage.local.get(SETTINGS_KEYS);
  return {
    apiKey: out.apiKey || "",
    model: out.model || "gpt-4o",
    systemPrompt: out.systemPrompt || "",
    sendImages: out.sendImages !== false
  };
}

// Open the side panel when the toolbar action is clicked.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab && tab.windowId != null) {
    try { await chrome.sidePanel.open({ windowId: tab.windowId }); } catch (_) {}
  }
});

// Make the side panel available on every tab.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// Find the active tab in the panel's window.
async function getActiveMoodleTab(senderWindowId) {
  const queryInfo = senderWindowId != null
    ? { active: true, windowId: senderWindowId }
    : { active: true, lastFocusedWindow: true };
  const [tab] = await chrome.tabs.query(queryInfo);
  return tab || null;
}

// Programmatically inject content scripts. Used as a fallback when the static
// content_scripts registration didn't fire — e.g. the tab was open before
// install, or the URL is at a path the static match pattern misses.
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: CONTENT_FILES
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// sendMessage with one auto-injection retry on "Receiving end does not exist".
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    const msg = e?.message || String(e);
    if (!/Receiving end does not exist|Could not establish connection/i.test(msg)) {
      throw e;
    }
    const inj = await ensureContentScript(tabId);
    if (!inj.ok) {
      throw new Error(
        "Could not inject content script into this tab. " +
        "Open the page on a regular http(s) URL (not chrome://, the Web Store, " +
        "or a PDF), then click Refresh. Detail: " + inj.error
      );
    }
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case "ping":
          sendResponse({ ok: true });
          return;

        case "getSettings":
          sendResponse({ ok: true, settings: await getSettings() });
          return;

        case "listQuestions": {
          const tab = await getActiveMoodleTab(sender.tab?.windowId);
          if (!tab) { sendResponse({ ok: false, error: "No active tab." }); return; }
          if (!/^https?:/i.test(tab.url || "")) {
            sendResponse({ ok: false, error: "Active tab is not an http(s) page. Switch to your Moodle quiz review tab." });
            return;
          }
          const res = await sendToTab(tab.id, { type: "listQuestions" });
          sendResponse({ ...res, tabId: tab.id, url: tab.url });
          return;
        }

        case "gradeSlot": {
          const tab = await getActiveMoodleTab(sender.tab?.windowId);
          if (!tab) { sendResponse({ ok: false, error: "No active tab." }); return; }
          const settings = await getSettings();
          if (!settings.apiKey) { sendResponse({ ok: false, error: "Set your OpenAI API key in Options." }); return; }

          const extracted = await sendToTab(tab.id, {
            type: "extractSlot",
            slot: msg.slot,
            includeImages: settings.sendImages
          });
          if (!extracted?.ok) { sendResponse({ ok: false, error: extracted?.error || "Could not extract question." }); return; }

          const q = extracted.question;
          const grade = await gradeQuestion({
            apiKey: settings.apiKey,
            model: settings.model,
            systemPrompt: settings.systemPrompt,
            qtextPlain: q.qtextPlain,
            subQuestions: q.subQuestions,
            maxMark: q.maxMark,
            studentResponse: q.studentResponse,
            imageDataUrls: settings.sendImages ? (extracted.imageDataUrls || []) : []
          });
          sendResponse({ ok: true, grade, question: q });
          return;
        }

        case "applyMark": {
          const tab = await getActiveMoodleTab(sender.tab?.windowId);
          if (!tab) { sendResponse({ ok: false, error: "No active tab." }); return; }
          const overrideUrl = msg.overrideUrl;
          if (!overrideUrl) { sendResponse({ ok: false, error: "No override URL on this question." }); return; }

          const key = "pending:" + new URL(overrideUrl).search;
          await chrome.storage.session.set({
            [key]: { mark: msg.mark, comment: msg.comment || "", ts: Date.now() }
          });
          await chrome.windows.create({
            url: overrideUrl,
            type: "popup",
            width: 720,
            height: 640
          });
          sendResponse({ ok: true });
          return;
        }

        default:
          sendResponse({ ok: false, error: `Unknown message type: ${msg?.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || String(err) });
    }
  })();
  return true; // keep the channel open for async sendResponse
});
