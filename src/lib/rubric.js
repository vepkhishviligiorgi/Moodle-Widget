// Default grading rubric / system prompt and the JSON schema we ask the model
// to respond with. Users can override the system prompt in Options.

export const DEFAULT_SYSTEM_PROMPT = `You are an experienced examiner grading short-answer questions for a university course.

Grading rules:
- Award marks strictly per the listed sub-question weights. Never exceed any sub-question's max, and never exceed the question's total max.
- Be lenient on phrasing, spelling, and grammar; reward correct concepts even if the wording is imperfect.
- Be strict on factual / scientific accuracy. Wrong identifications, wrong phases, wrong mechanisms = 0 for that sub-part.
- Partial credit is allowed (e.g. half marks) when the student is partly correct or omits a key element.
- For each sub-question, give a one-sentence reason citing what the student did or did not write.
- If the question references an image and one is provided, use it to verify the student's identification.
- If the student's response is empty or off-topic, award 0 with a brief note.
- Set "confidence" to "low" if the question is ambiguous, the rubric is unclear, or the response is borderline; otherwise "medium" or "high".

Return ONLY valid JSON matching the provided schema. No prose outside the JSON.`;

export const RESPONSE_SCHEMA = {
  name: "moodle_grade",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sub_scores: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string", description: "Short label for the sub-question" },
            max: { type: "number" },
            awarded: { type: "number" },
            reason: { type: "string" }
          },
          required: ["label", "max", "awarded", "reason"]
        }
      },
      total: { type: "number", description: "Sum of awarded sub-scores. Must not exceed maxMark." },
      summary: { type: "string", description: "1-3 sentence overall feedback for the student." },
      confidence: { type: "string", enum: ["low", "medium", "high"] }
    },
    required: ["sub_scores", "total", "summary", "confidence"]
  },
  strict: true
};

export function buildUserPrompt({ qtextPlain, subQuestions, maxMark, studentResponse, hasImages }) {
  const parts = [];
  parts.push(`Question (max ${maxMark ?? "?"} marks):`);
  parts.push(qtextPlain || "(no question text extracted)");
  if (subQuestions && subQuestions.length) {
    parts.push("");
    parts.push("Sub-questions and weights:");
    subQuestions.forEach((s, i) => {
      parts.push(`  ${i + 1}. (${s.max}) ${s.text}`);
    });
  }
  if (hasImages) {
    parts.push("");
    parts.push("An image is attached below; use it for any question parts that refer to a figure, slide, or arrow.");
  }
  parts.push("");
  parts.push("Student response:");
  parts.push(studentResponse ? studentResponse : "(empty)");
  parts.push("");
  parts.push(`Grade now. Return JSON only. The "total" must equal the sum of "awarded" and must not exceed ${maxMark ?? "the max"}.`);
  return parts.join("\n");
}
