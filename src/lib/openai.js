// OpenAI Chat Completions client. Used from the background service worker.

import { DEFAULT_SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from "./rubric.js";

const API_URL = "https://api.openai.com/v1/chat/completions";

export async function gradeQuestion({
  apiKey,
  model = "gpt-4o",
  systemPrompt,
  qtextPlain,
  subQuestions,
  maxMark,
  studentResponse,
  imageDataUrls = [],
  signal
}) {
  if (!apiKey) throw new Error("Missing OpenAI API key. Set it in the extension Options page.");

  const userText = buildUserPrompt({
    qtextPlain,
    subQuestions,
    maxMark,
    studentResponse,
    hasImages: imageDataUrls.length > 0
  });

  const userContent = [{ type: "text", text: userText }];
  for (const url of imageDataUrls) {
    userContent.push({ type: "image_url", image_url: { url, detail: "high" } });
  }

  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
    messages: [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ]
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body),
    signal
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
    throw new Error(`OpenAI ${res.status}: ${detail || res.statusText}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned no content.");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) { throw new Error("OpenAI response was not valid JSON."); }

  // Defensive clamp: never let a hallucinated total exceed the max.
  if (typeof maxMark === "number" && typeof parsed.total === "number" && parsed.total > maxMark) {
    parsed.total = maxMark;
    parsed._clamped = true;
  }
  return parsed;
}
