# Moodle Grader — AI side-panel for short-answer grading

A Chrome / Edge extension that sits beside your Moodle quiz attempt review page and proposes scores for short-answer and essay questions (including ones with images, like histology slides). It does **not** auto-submit grades — it pre-fills Moodle's existing *Make comment or override mark* popup and you click **Save**.

## What it does

- Detects short-answer / essay / regexp question types on `mod/quiz/review.php` pages. MCQ and similar auto-graded types are skipped (Moodle handles those).
- Parses inline sub-question weights of the form `(0.25)` from the question stem.
- Sends question text, sub-marks, the student's response, and (optionally) any inline images to OpenAI for grading.
- Shows a per-sub-question breakdown with awarded marks, a written reason, and a confidence chip.
- Click **Apply in Moodle** → the extension opens Moodle's own override-mark popup and pre-fills the mark + comment. You review and click **Save**.

## Install (developer mode)

1. `git clone` this repo.
2. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**.
3. Click **Load unpacked**, choose this repo's root folder.
4. Click the extension's toolbar icon to open the side panel, then open **Options** (link in the panel header) and:
   - Paste your OpenAI API key.
   - Pick a model (`gpt-4o` recommended for image questions).
   - Optionally edit the system prompt to match your course's rubric.

## Use

1. In Moodle, open a finished quiz attempt review (`Quiz → Attempts → Review attempt`).
2. Open the side panel — it lists every short-answer question on the page.
3. For each question, click **Grade with AI**. Review the breakdown.
4. Adjust the mark / comment if needed, then click **Apply in Moodle**.
5. Moodle's override-mark popup opens with the values pre-filled. Click **Save**.

## Privacy

- Your API key lives in `chrome.storage.local` on your machine.
- Student responses (and images, unless you disable that toggle) are sent to OpenAI when you press **Grade**. Confirm this complies with your institution's data policy before grading real attempts.
- The extension never touches Moodle's grade book on its own — the human always submits the override.

## File layout

```
manifest.json               MV3 manifest, side panel + content scripts
src/background.js           Service worker (OpenAI calls, message routing)
src/content.js              Injected on quiz/review.php — extracts questions
src/mark_filler.js          Injected on quiz/comment.php — pre-fills override
src/sidepanel.{html,js,css} Side-panel UI
src/options.{html,js}       Settings page
src/lib/moodle.js           DOM helpers (testable)
src/lib/openai.js           OpenAI client
src/lib/rubric.js           Default grading prompt + JSON schema
tests/fixtures/             Saved Moodle HTML for manual testing
tests/moodle.test.html      Open in a browser to run lib/moodle.js asserts
```

## Testing

- **Unit:** open `tests/moodle.test.html` in your browser. It runs `findQuestions` / `parseSubMarks` against the bundled fixtures and prints pass/fail.
- **End-to-end:** load the extension unpacked, log into your Moodle, open a real review page with at least one short-answer question, and walk through the flow above.

## Limitations

- Tested against vanilla Moodle 4.x DOM. Heavily customised themes that change `.que` / `.qtext` / `.answer` class names may break extraction — fixes should be localised to `src/lib/moodle.js`.
- Image questions require a vision-capable model (`gpt-4o*`). With `Send images` disabled, image questions fall back to text-only grading and will usually be marked low confidence.
- The extension only acts on the currently active tab.
