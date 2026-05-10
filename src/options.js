const KEYS = ["apiKey", "model", "systemPrompt", "sendImages"];

async function load() {
  const s = await chrome.storage.local.get(KEYS);
  document.getElementById("apiKey").value = s.apiKey || "";
  document.getElementById("model").value = s.model || "gpt-4o";
  document.getElementById("systemPrompt").value = s.systemPrompt || "";
  document.getElementById("sendImages").checked = s.sendImages !== false;
}

async function save() {
  await chrome.storage.local.set({
    apiKey: document.getElementById("apiKey").value.trim(),
    model: document.getElementById("model").value,
    systemPrompt: document.getElementById("systemPrompt").value,
    sendImages: document.getElementById("sendImages").checked
  });
  const flag = document.getElementById("saved");
  flag.classList.add("show");
  setTimeout(() => flag.classList.remove("show"), 1200);
}

document.getElementById("save").addEventListener("click", save);
document.addEventListener("DOMContentLoaded", load);
