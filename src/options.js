import { PROVIDERS } from "./lib/openai.js";

const KEYS = ["apiKey", "provider", "baseUrl", "model", "systemPrompt", "sendImages"];

const el = (id) => document.getElementById(id);

const PROVIDER_HINTS = {
  gemini: 'Free tier ~1500 requests/day on gemini-2.0-flash. Sign in at <a href="https://aistudio.google.com/app/apikey" target="_blank">AI Studio</a> to get a key. No credit card required.',
  openai: 'Paid. Pricing at <a href="https://openai.com/api/pricing" target="_blank">openai.com/api/pricing</a>. gpt-4o-mini is cheapest with vision.',
  custom: 'Any OpenAI-compatible endpoint. For local Ollama, install Ollama, run <code>ollama pull llama3.2-vision</code>, then set Base URL to <code>http://localhost:11434/v1</code> and API key to anything (e.g. <code>ollama</code>).'
};

function refreshProviderUi() {
  const provider = el("provider").value;
  const def = PROVIDERS[provider];

  el("provider-hint").innerHTML = PROVIDER_HINTS[provider] || "";

  // Base URL field: only relevant for "custom".
  const isCustom = provider === "custom";
  el("baseUrl").disabled = !isCustom;
  el("baseUrl").required = isCustom;
  el("baseUrl-label").style.opacity = isCustom ? "1" : "0.5";

  // Model dropdown — populated from PROVIDERS, plus a free-text option.
  const modelSel = el("model");
  const previous = modelSel.value;
  modelSel.innerHTML = "";
  const models = def?.models || [];
  for (const m of models) {
    const o = document.createElement("option");
    o.value = m; o.textContent = m;
    modelSel.appendChild(o);
  }
  // Always include an "(other)" entry so the user can type a custom model below.
  const other = document.createElement("option");
  other.value = "__other__"; other.textContent = "Other (specify below)…";
  modelSel.appendChild(other);

  if (models.includes(previous)) {
    modelSel.value = previous;
  } else if (def?.defaultModel) {
    modelSel.value = def.defaultModel;
  }
  refreshModelHint();
}

function refreshModelHint() {
  const provider = el("provider").value;
  const m = el("model").value;
  let hint = "";
  if (provider === "gemini") {
    if (m === "gemini-2.0-flash") hint = "Most generous free quota (~1500 req/day). Good vision quality. Recommended.";
    else if (m === "gemini-2.5-flash") hint = "Newer, smarter, but lower free quota (~250 req/day).";
    else if (m === "gemini-2.5-flash-lite") hint = "Fastest and cheapest. Good for plain text grading.";
    else if (m === "gemini-2.5-pro") hint = "Highest quality, lowest free quota.";
  }
  el("model-hint").innerHTML = hint;
}

async function load() {
  const s = await chrome.storage.local.get(KEYS);
  el("provider").value = s.provider || "gemini";
  el("baseUrl").value = s.baseUrl || "";
  el("apiKey").value = s.apiKey || "";
  el("systemPrompt").value = s.systemPrompt || "";
  el("sendImages").checked = s.sendImages !== false;
  refreshProviderUi();
  if (s.model) {
    const opt = Array.from(el("model").options).find((o) => o.value === s.model);
    el("model").value = opt ? s.model : "__other__";
    if (!opt) {
      // Render a free-text input next to the dropdown for custom model names.
      ensureCustomModelInput().value = s.model;
    }
  }
  refreshModelHint();
}

function ensureCustomModelInput() {
  let inp = document.getElementById("model-custom");
  if (!inp) {
    inp = document.createElement("input");
    inp.type = "text";
    inp.id = "model-custom";
    inp.placeholder = "model name, e.g. llama3.2-vision";
    inp.style.marginTop = "6px";
    inp.style.width = "100%";
    el("model").after(inp);
  }
  inp.style.display = "";
  return inp;
}

function hideCustomModelInput() {
  const inp = document.getElementById("model-custom");
  if (inp) inp.style.display = "none";
}

async function save() {
  let model = el("model").value;
  if (model === "__other__") {
    model = (document.getElementById("model-custom")?.value || "").trim();
  }
  await chrome.storage.local.set({
    provider: el("provider").value,
    baseUrl: el("baseUrl").value.trim(),
    apiKey: el("apiKey").value.trim(),
    model,
    systemPrompt: el("systemPrompt").value,
    sendImages: el("sendImages").checked
  });
  const flag = el("saved");
  flag.classList.add("show");
  setTimeout(() => flag.classList.remove("show"), 1200);
}

el("provider").addEventListener("change", refreshProviderUi);
el("model").addEventListener("change", () => {
  if (el("model").value === "__other__") ensureCustomModelInput().focus();
  else hideCustomModelInput();
  refreshModelHint();
});
el("save").addEventListener("click", save);
document.addEventListener("DOMContentLoaded", load);
