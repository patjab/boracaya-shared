# Agent instructions

<!-- adversarial-review -->
## Adversarial review before the PR (patjab/boracaya-cdk#1913)

This repo's merge gate is a review record, `.review/<patch-id>.json`, written by
`.adversarial-review/adversarial_review.py` when a separate headless Codex
reviewer launched by that script has passed exactly this change. The
`review-record` CI check verifies it. Before you finish any task that changed
code:

1. Run `git config core.hooksPath .githooks` once per checkout (the pre-push
   check; a Claude session does this itself).
2. Commit your work (the reviewer reviews commits; a dirty tree is refused).
3. Run `python3 -I .adversarial-review/adversarial_review.py round --vendor codex`
   (it can take 10-30 minutes).
4. Exit 0: done, the record is committed - include it in the change. Exit 10:
   answer every finding, then run the round again:
   - verify it first (about 1 in 12 findings is factually wrong);
   - real: fix it with a test, commit, `respond F3 --fixed <sha>`;
   - wrong: `respond F3 --rejected "<evidence>"` - the reviewer rules on it;
   - out of scope: `respond F3 --deferred "<issue>"`.
   Exit 4 (escalated) or 5 (round cap): stop and report it in your summary;
   the owner decides. Exit 3: the reviewer failed - say so in your summary.
5. Never write `.review/` or edit `.adversarial-review/` yourself.

The reviewer model and effort come from the Mission Control review policy.
Environment setup script (internet is available there) - fetch it once so the
engine has it even if the task itself runs offline:

```bash
git config core.hooksPath .githooks
mkdir -p "$HOME/.adversarial-review"
sha=$(git ls-remote https://github.com/patjab/.github refs/heads/review-policy | cut -f1)
[ -n "$sha" ] && curl -fsSL "https://raw.githubusercontent.com/patjab/.github/$sha/review-policy.json" \
  -o "$HOME/.adversarial-review/review-policy.json" || true
```
<!-- /adversarial-review -->
