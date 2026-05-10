// Moodle DOM helpers. Pure functions where possible so they can be unit-tested
// against saved HTML fixtures by passing in any Document-like object.
//
// Loaded as a classic content script (not a module) so it shares globals with
// content.js. We expose a single `MoodleGrader` namespace on `globalThis`.

(function (root) {
  "use strict";

  // Question type CSS classes Moodle uses on `div.que`. We grade only types
  // where teachers typically need to award partial credit by hand.
  const SHORT_ANSWER_TYPES = ["essay", "shortanswer", "regexp", "ddwtos"];
  const SKIP_TYPES = ["multichoice", "truefalse", "match", "ddmarker", "ddimageortext", "calculatedmulti"];

  function classifyQuestion(queEl) {
    const cls = queEl.classList;
    for (const t of SHORT_ANSWER_TYPES) if (cls.contains(t)) return t;
    for (const t of SKIP_TYPES) if (cls.contains(t)) return `skip:${t}`;
    return "unknown";
  }

  // Slot number: Moodle puts e.g. id="question-123-4" on the .que wrapper, where
  // the trailing number is the slot. Fall back to the visible "Question N" text.
  function extractSlot(queEl) {
    const id = queEl.id || "";
    const m = id.match(/-(\d+)$/);
    if (m) return parseInt(m[1], 10);
    const info = queEl.querySelector(".info .qno, .info h3");
    if (info) {
      const n = info.textContent.match(/(\d+)/);
      if (n) return parseInt(n[1], 10);
    }
    return null;
  }

  function extractMaxMark(queEl) {
    const grade = queEl.querySelector(".info .grade, .info .state + .grade");
    if (!grade) return null;
    // "Mark 0.50 out of 1.00" → 1.00
    const m = grade.textContent.match(/out of\s+([\d.]+)/i);
    return m ? parseFloat(m[1]) : null;
  }

  function extractCurrentMark(queEl) {
    const grade = queEl.querySelector(".info .grade");
    if (!grade) return null;
    const m = grade.textContent.match(/Mark\s+([\d.]+)\s+out of/i);
    return m ? parseFloat(m[1]) : null;
  }

  function extractQuestionText(queEl) {
    const qtext = queEl.querySelector(".qtext");
    if (!qtext) return { html: "", plain: "" };
    return {
      html: qtext.innerHTML,
      plain: (qtext.textContent || "").replace(/\s+/g, " ").trim()
    };
  }

  function extractImages(queEl, baseUrl) {
    const out = [];
    const imgs = queEl.querySelectorAll(".qtext img, .formulation img");
    imgs.forEach((img) => {
      const rawSrc = img.getAttribute("src");
      if (!rawSrc) return;
      let abs = rawSrc;
      try { abs = new URL(rawSrc, baseUrl || (typeof location !== "undefined" ? location.href : "")).href; } catch (_) {}
      out.push({ src: abs, alt: img.getAttribute("alt") || "" });
    });
    return out;
  }

  // Student response on a *finished* attempt review page is rendered HTML, not
  // an editable textarea. Moodle's essay type uses `.qtype_essay_response`;
  // shortanswer renders the student input inside the `.answer` block.
  function extractStudentResponse(queEl) {
    const candidates = [
      ".qtype_essay_response",
      ".answer",
      ".formulation .answer",
      ".rsp .answer"
    ];
    for (const sel of candidates) {
      const el = queEl.querySelector(sel);
      if (el && el.textContent.trim()) {
        return (el.textContent || "").replace(/ /g, " ").trim();
      }
    }
    // Fallback: textarea (in case page is mid-attempt)
    const ta = queEl.querySelector("textarea");
    if (ta && ta.value && ta.value.trim()) return ta.value.trim();
    return "";
  }

  // The "Make comment or override mark" link sits inside `.comment-link` or as
  // an anchor whose href contains `comment.php`.
  function extractOverrideUrl(queEl, baseUrl) {
    const a = queEl.querySelector('a[href*="comment.php"]');
    if (!a) return null;
    try { return new URL(a.getAttribute("href"), baseUrl || (typeof location !== "undefined" ? location.href : "")).href; }
    catch (_) { return a.getAttribute("href"); }
  }

  // Inline annotations like "(0.25)" embedded in the question stem mark
  // sub-question weights. Returns numbers in document order.
  function parseSubMarks(plainText) {
    if (!plainText) return [];
    const out = [];
    const re = /\(\s*([0-9]+(?:\.[0-9]+)?)\s*\)/g;
    let m;
    while ((m = re.exec(plainText)) !== null) {
      const v = parseFloat(m[1]);
      if (!isNaN(v) && v > 0 && v <= 100) out.push(v);
    }
    return out;
  }

  // Split the stem into sub-question chunks using "(N)" markers as separators.
  // The chunk *before* each marker is the sub-question that marker weighs.
  function splitSubQuestions(plainText) {
    if (!plainText) return [];
    const parts = plainText.split(/\(\s*[0-9]+(?:\.[0-9]+)?\s*\)/);
    const marks = parseSubMarks(plainText);
    const out = [];
    for (let i = 0; i < marks.length; i++) {
      const text = (parts[i] || "").trim();
      if (text) out.push({ text, max: marks[i] });
    }
    return out;
  }

  function findQuestions(doc, baseUrl) {
    const root = doc || (typeof document !== "undefined" ? document : null);
    if (!root) return [];
    const url = baseUrl || (root.location && root.location.href) || (typeof location !== "undefined" ? location.href : "");
    const ques = Array.from(root.querySelectorAll("div.que"));
    const out = [];
    for (const q of ques) {
      const type = classifyQuestion(q);
      if (type.startsWith("skip:") || type === "unknown") continue;
      const slot = extractSlot(q);
      const { html, plain } = extractQuestionText(q);
      const subs = splitSubQuestions(plain);
      out.push({
        slot,
        type,
        qtextHtml: html,
        qtextPlain: plain,
        subQuestions: subs,
        subMarks: subs.map((s) => s.max),
        images: extractImages(q, url),
        studentResponse: extractStudentResponse(q),
        maxMark: extractMaxMark(q),
        currentMark: extractCurrentMark(q),
        overrideUrl: extractOverrideUrl(q, url)
      });
    }
    return out;
  }

  root.MoodleGrader = {
    findQuestions,
    parseSubMarks,
    splitSubQuestions,
    classifyQuestion,
    SHORT_ANSWER_TYPES,
    SKIP_TYPES
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
