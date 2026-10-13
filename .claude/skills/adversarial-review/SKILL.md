---
name: adversarial-review
description: Run the adversarial review loop on this branch before pushing. Use before every push of a feature branch or PR branch, before finishing any task that changed code, and whenever the pre-push hook or the review-record check says a review record is missing. A separate headless Claude reviewer attacks the change, you answer every finding, and the engine commits a .review/<patch-id>.json record when a final pass is clean.
---

# Adversarial review before the push

This repo's merge gate is a review record: `.review/<patch-id>.json`, written by
`.adversarial-review/adversarial_review.py` when a reviewer launched by the
engine (a fresh headless `claude -p`, never you, never a sub-agent you brief) has passed
exactly the diff you are about to push. The pre-push hook and the
`review-record` CI check both verify it (patjab/boracaya-cdk#1913). The model
and effort the reviewer runs with come from the Mission Control review policy;
do not pass `--model` unless the user asked for a specific one.

## The loop

1. Commit your work. The reviewer reviews commits; a dirty tree is refused.
2. Run a round. It can take 10-30 minutes, so run it in the background and wait
   for it rather than letting a foreground timeout kill it:

   ```bash
   python3 -I .adversarial-review/adversarial_review.py round --vendor claude
   ```

3. Act on the exit code:

   | exit | meaning | do |
   |---|---|---|
   | 0 | PASS: the record is written and committed | push |
   | 10 | findings need an answer | step 4, then run the round again |
   | 4 | escalated: the reviewer upheld a rejection `max_exchanges` times | ask the user; record their call with `respond <id> --owner "<decision>"` |
   | 5 | round cap reached without a clean final pass | stop and ask the user |
   | 2 | precondition (dirty tree, protected branch, bad config) | fix what it says |
   | 3 | the reviewer failed (CLI missing, timeout, bad output) | retry once; then tell the user |

4. Answer **every** finding. Verify it first: about 1 in 12 findings in this
   protocol is factually wrong, and complying uncritically deletes correct code.
   - Real: fix it, add or adjust the test that pins it, commit, then
     `python3 -I .adversarial-review/adversarial_review.py respond F3 --fixed <sha>`.
   - Wrong: `respond F3 --rejected "<evidence: file:line, test name, the input that shows it>"`.
     The reviewer, not you, rules on the rejection in the next pass.
   - Real but out of this change's scope (`out of scope` in the finding): open a
     follow-up issue and `respond F3 --deferred "<issue url>"`.

`status` shows the loop; `policy` shows the effective reviewer model and modes.

## Rules

- Never write, edit or delete anything under `.review/` yourself, and never
  edit `.adversarial-review/`. A hook denies the first; the CI check flags a
  drifted engine. Fix the code, not the gate.
- Do not stop the loop because the findings feel minor. A rejected finding
  needs evidence, not a preference.
- After the record is committed, any further code change needs another round
  (a `final` pass on the new diff). Merging the base branch in cleanly does not.
- Docs-only changes (the repo's `skip_paths`) get a record without a reviewer.
