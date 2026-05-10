const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const cardsEl = $("#cards");
const statusEl = $("#status");
const emptyEl = $("#empty");
const refreshBtn = $("#refresh");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

async function send(msg) {
  return await chrome.runtime.sendMessage(msg);
}

function renderEmpty(show) {
  emptyEl.classList.toggle("hidden", !show);
}

function makeCard(q) {
  const tpl = $("#card-tpl");
  const node = tpl.content.firstElementChild.cloneNode(true);
  $(".qno", node).textContent = `Question ${q.slot ?? "?"}`;
  $(".qtype", node).textContent = q.type;
  $(".qmax", node).textContent = `out of ${q.maxMark ?? "?"}`;
  $(".qtext", node).textContent = q.qtextPlain || "(no text)";
  const subsUl = $(".subs", node);
  if (q.subQuestions?.length) {
    q.subQuestions.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = `(${s.max}) ${s.text}`;
      subsUl.appendChild(li);
    });
  } else {
    subsUl.remove();
  }
  $(".resp", node).textContent = q.studentResponse || "(empty)";

  const gradeBtn = $(".grade-btn", node);
  const resultEl = $(".result", node);
  const errEl = $(".err", node);
  const applyBtn = $(".apply-btn", node);

  gradeBtn.addEventListener("click", async () => {
    errEl.classList.add("hidden");
    resultEl.classList.add("hidden");
    gradeBtn.disabled = true;
    gradeBtn.classList.add("busy");
    gradeBtn.textContent = "Grading";
    try {
      const r = await send({ type: "gradeSlot", slot: q.slot });
      if (!r?.ok) throw new Error(r?.error || "Grading failed.");
      renderResult(node, r.grade, q);
    } catch (e) {
      errEl.textContent = e.message || String(e);
      errEl.classList.remove("hidden");
    } finally {
      gradeBtn.disabled = false;
      gradeBtn.classList.remove("busy");
      gradeBtn.textContent = "Grade with AI";
    }
  });

  applyBtn.addEventListener("click", async () => {
    errEl.classList.add("hidden");
    if (!q.overrideUrl) {
      errEl.textContent = "No override link found on this question. Is the attempt finished?";
      errEl.classList.remove("hidden");
      return;
    }
    const mark = parseFloat($(".mark-input", node).value);
    if (isNaN(mark)) {
      errEl.textContent = "Mark must be a number.";
      errEl.classList.remove("hidden");
      return;
    }
    if (typeof q.maxMark === "number" && mark > q.maxMark) {
      errEl.textContent = `Mark exceeds max (${q.maxMark}).`;
      errEl.classList.remove("hidden");
      return;
    }
    const comment = $(".comment-input", node).value;
    const r = await send({ type: "applyMark", overrideUrl: q.overrideUrl, mark, comment });
    if (!r?.ok) {
      errEl.textContent = r?.error || "Apply failed.";
      errEl.classList.remove("hidden");
      return;
    }
    setStatus("Opened Moodle override popup. Review and click Save.", "warn");
  });

  return node;
}

function renderResult(card, grade, q) {
  const resultEl = $(".result", card);
  resultEl.classList.remove("hidden");

  const conf = $(".conf", card);
  conf.textContent = `confidence: ${grade.confidence}`;
  conf.className = "conf " + (grade.confidence || "");

  const tbody = $(".breakdown tbody", card);
  tbody.innerHTML = "";
  (grade.sub_scores || []).forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td></td><td></td><td></td><td></td>`;
    tr.children[0].textContent = s.label;
    tr.children[1].textContent = s.awarded;
    tr.children[2].textContent = s.max;
    tr.children[3].textContent = s.reason;
    tbody.appendChild(tr);
  });

  $(".summary", card).textContent = grade.summary +
    (grade._clamped ? "  (Total clamped to question max.)" : "");

  $(".mark-input", card).value = grade.total;
  $(".mark-input", card).max = q.maxMark ?? "";
  $(".comment-input", card).value = grade.summary || "";
}

async function load() {
  cardsEl.innerHTML = "";
  renderEmpty(false);
  setStatus("Scanning page…");

  const settingsResp = await send({ type: "getSettings" });
  const haveKey = settingsResp?.ok && settingsResp.settings.apiKey;
  if (!haveKey) {
    setStatus("No OpenAI API key set. Open Options to add one.", "warn");
  } else {
    setStatus(`Model: ${settingsResp.settings.model}`);
  }

  const r = await send({ type: "listQuestions" });
  if (!r?.ok) {
    setStatus(r?.error || "Could not read the active tab. Is it a Moodle quiz review page?", "err");
    return;
  }
  const qs = r.questions || [];
  if (!qs.length) { renderEmpty(true); return; }
  qs.forEach((q) => cardsEl.appendChild(makeCard(q)));
}

refreshBtn.addEventListener("click", load);
document.addEventListener("DOMContentLoaded", load);

// Reload when the user switches tabs so the side panel reflects the page they
// are looking at.
chrome.tabs.onActivated.addListener(() => load());
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === "complete") load(); });
