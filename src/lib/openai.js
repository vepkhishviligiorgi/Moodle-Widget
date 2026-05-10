// OpenAI-compatible Chat Completions client. Works against any provider that
// speaks the same wire format: OpenAI, Google Gemini (OpenAI-compat endpoint),
// OpenRouter, Groq, local Ollama / LM Studio, etc.

import { DEFAULT_SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from "./rubric.js";

export const PROVIDERS = {
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"]
  },
  gemini: {
    label: "Google Gemini (free tier)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"]
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    baseUrl: "",
    defaultModel: "",
    models: []
  }
};

export function resolveBaseUrl(provider, customBaseUrl) {
  if (provider === "custom") return (customBaseUrl || "").replace(/\/+$/, "");
  return PROVIDERS[provider]?.baseUrl || PROVIDERS.openai.baseUrl;
}

export async function gradeQuestion({
  apiKey,
  provider = "openai",
  baseUrl,
  model,
  systemPrompt,
  qtextPlain,
  subQuestions,
  maxMark,
  studentResponse,
  imageDataUrls = [],
  signal
}) {
  if (!apiKey) throw new Error("Missing API key. Set it in the extension Options page.");
  const resolvedBase = resolveBaseUrl(provider, baseUrl);
  if (!resolvedBase) throw new Error("Custom provider needs a Base URL in Options.");
  const resolvedModel = model || PROVIDERS[provider]?.defaultModel;
  if (!resolvedModel) throw new Error("No model selected in Options.");

  const userText = buildUserPrompt({
    qtextPlain,
    subQuestions,
    maxMark,
    studentResponse,
    hasImages: imageDataUrls.length > 0
  });

  const userContent = [{ type: "text", text: userText }];
  for (const url of imageDataUrls) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const body = {
    model: resolvedModel,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    messages: [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ]
  };

  const url = `${resolvedBase}/chat/completions`;

  let res;
  let attempt = 0;
  while (true) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });
    if (res.status !== 429 || attempt >= 1) break;
    const retryAfterHeader = parseFloat(res.headers.get("retry-after") || "0");
    const wait = Math.min(30000, Math.max(2000, (retryAfterHeader || 5) * 1000));
    await new Promise((r) => setTimeout(r, wait));
    attempt++;
  }

  if (!res.ok) {
    let detail = "";
    let bodyText = "";
    try {
      bodyText = await res.text();
      const j = JSON.parse(bodyText);
      detail = j?.error?.message || j?.message || "";
    } catch (_) { detail = bodyText.slice(0, 300); }
    if (res.status === 429) {
      const hint = provider === "gemini"
        ? " Switch to model gemini-2.0-flash in Options for the most generous free quota (15 RPM / 1500 per day), or wait a minute and retry."
        : " Wait and retry, or check your provider's quota.";
      detail = (detail || "rate limit / quota exceeded") + hint;
    }
    throw new Error(`${PROVIDERS[provider]?.label || provider} ${res.status}: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Provider returned no content.");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) {
    // Some providers wrap JSON in markdown fences. Strip and retry.
    const stripped = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    try { parsed = JSON.parse(stripped); }
    catch (_) { throw new Error("Provider response was not valid JSON."); }
  }

  if (typeof maxMark === "number" && typeof parsed.total === "number" && parsed.total > maxMark) {
    parsed.total = maxMark;
    parsed._clamped = true;
  }
  return parsed;
}
