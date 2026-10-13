# Claude instructions

<!-- adversarial-review -->
## Adversarial review before every push (patjab/boracaya-cdk#1913)

Before pushing a feature branch, run the `adversarial-review` skill
(`.claude/skills/adversarial-review/SKILL.md`): a separate headless Claude
reviewer attacks the change, you answer every finding, and the engine commits
`.review/<patch-id>.json` when a final pass is clean. The pre-push hook and the
`review-record` CI check verify that record. Never write `.review/` yourself.
<!-- /adversarial-review -->
