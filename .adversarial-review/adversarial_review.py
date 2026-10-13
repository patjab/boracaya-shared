#!/usr/bin/env python3
"""Adversarial review inside the authoring session (cdk#1913, cdk#1914).

The Jeongyeon reviewer (review/) reviews a PR after it is pushed, one aimed axis
per push. This engine runs the same protocol BEFORE the push, inside the Claude
or Codex session that wrote the change: a fresh headless reviewer of the SAME
vendor (`claude -p` from a Claude session, `codex exec` from a Codex session),
launched by this script with a fixed prompt so the author cannot steer it, reads
the whole checkout, and returns findings as JSON. The author answers every
finding (`respond`); the reviewer, not the author, rules on each rejection.
When a pass on `final` comes back clean the engine writes
`.review/<patch-id>.json` and commits it. CI (`record/`, cdk#1917) and the
pre-push hook check that record against the diff actually being pushed.

  status                      base, patch-id, loop state, record
  round [--axis A]            run reviewer passes until there is something to answer, or done
  respond ID --fixed SHA | --rejected EVIDENCE | --deferred ISSUE | --owner DECISION
  verify [--base R] [--head R] [--pre-push]   is there a passing record for this diff?
  policy                      the effective review policy for this repo and vendor

The patch-id is a sha256 of `git diff <merge-base> <head> -- . ':(exclude).review'`
without its `index` lines and hunk line numbers, so a base merge that leaves the
three context lines around each hunk alone keeps it, and any real code change -
whitespace included - moves it. The reviewer model and the loop knobs come from the
Mission Control review policy (patjab/mission-control#54), published to the
public `patjab/.github` repo, branch `review-policy`; `.github/codex-review.yml`
still supplies the repo's axes, off_limits and skip_paths.

Stdlib only (Python 3.9+). Each calling repo carries a copy of this file and
review_config.py in `.adversarial-review/`; the record check warns on drift.

Exit codes: 0 done / verified; 1 verify failed; 2 usage or precondition;
3 reviewer failed; 4 escalated to the owner; 5 round cap reached;
10 findings need an answer (run `respond`, fix, commit, then `round` again).
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
# A __pycache__ beside the vendored copy would make every checkout dirty, and a
# dirty tree is refused (the reviewer reviews commits).
sys.dont_write_bytecode = True
for _candidate in (HERE, HERE.parent / "review"):
    if (_candidate / "review_config.py").exists():
        sys.path.insert(0, str(_candidate))
        break
import review_config  # noqa: E402  (vendored next to this file, or ../review in codex-review)

ENGINE_VERSION = "1"
RECORD_SCHEMA = "adversarial-review-record/1"
RECORD_DIR = ".review"
PROTECTED_BRANCHES = {"main", "master", "develop"}
POLICY_GIT = os.environ.get("ADVERSARIAL_REVIEW_POLICY_GIT", "https://github.com/patjab/.github")
POLICY_RAW = os.environ.get("ADVERSARIAL_REVIEW_POLICY_RAW",
                            "https://raw.githubusercontent.com/patjab/.github/{sha}/review-policy.json")
POLICY_BRANCH = "review-policy"
# Where a Codex cloud setup script (which has internet) drops the policy for a
# task that may run offline; ADVERSARIAL_REVIEW_POLICY_FILE overrides it.
SETUP_POLICY_FILE = pathlib.Path.home() / ".adversarial-review" / "review-policy.json"
VENDORS = ("claude", "codex")
SEVERITIES = ("blocker", "major", "minor", "nit")
MODES = ("off", "report", "block")

DEFAULT_POLICY = {
    "jeongyeon": "on",
    "record_check": "report",
    "max_exchanges": 2,
    "round_timeout_minutes": 30,
    "reviewer": {v: {"model": "", "effort": ""} for v in VENDORS},
}

# The axis prompts are the ones the Jeongyeon harness uses (review/codex_review.py),
# restated for a reviewer that reads the checkout instead of a payload.
AXES = {
    "broad": ("AXIS: broad severity calibration. Review the change as a whole. For every "
              "finding ask: would this BLOCK the merge? Calibrate severity honestly."),
    "tests": ("AXIS: tests. For each behavior the change claims, ask: what is the SMALLEST "
              "production change that breaks this, and would any test in the diff then fail? "
              "Name tests that assert implementation echoes rather than outcomes, and "
              "behaviors with no failing-test pin at all."),
    "coupling": ("AXIS: runtime coupling no type checker sees - names duplicated across "
                 "boundaries, formats parsed on the other side, dicts whose shape is asserted "
                 "elsewhere. Read the far side of each seam in the repository."),
    "chain": ("AXIS: the whole call chain, not the changed module. Follow one request end to "
              "end through every hop. Where does an assumption made in one hop go unchecked "
              "in the next?"),
    "unexamined": ("AXIS: least-examined surface. Attack the parts of this change nobody has "
                   "discussed, and any finding the LEDGER below closed - is the closure itself "
                   "sound?"),
    "final": ("AXIS: final verdict. Given everything, would you merge this? An empty findings "
              "list is explicitly permitted if nothing remains."),
}

FINDINGS_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string"},
        "findings": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "file": {"type": "string"},
                "line": {"type": "integer"},
                "claim": {"type": "string"},
                "severity": {"type": "string", "enum": list(SEVERITIES)},
                "stays_in_scope": {"type": "boolean"},
                "blocks_merge": {"type": "boolean"},
            },
            "required": ["title", "file", "line", "claim", "severity", "stays_in_scope", "blocks_merge"],
            "additionalProperties": False,
        }},
        "adjudications": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "decision": {"type": "string", "enum": ["upheld", "withdrawn"]},
                "reason": {"type": "string"},
            },
            "required": ["id", "decision", "reason"],
            "additionalProperties": False,
        }},
    },
    "required": ["verdict", "findings", "adjudications"],
    "additionalProperties": False,
}

PROMPT = """You are the adversarial reviewer in an author/reviewer protocol. Another agent
wrote this change; you did not, and you owe it nothing. Your job is to find what is
wrong with it before it is pushed.

Repository: {repo} (the current directory). Branch {branch}, compared with {base}.
See the change with exactly:  git diff {merge_base} {head}
Read any file in the repository you need - the far side of a seam, the callers, the
tests. You have read-only tools: never edit, write, commit or push anything.

{axis}

{off_limits}Rules:
- Every finding cites a file and line you actually read, and a concrete failure
  scenario: the input or state, and the wrong outcome.
- About 1 in 12 findings in this protocol turns out to be factually wrong; verify
  before you report.
- An empty findings list is an acceptable and welcome answer. Do not pad.
- `line` is 1-based in the NEW version of the file (0 if not anchored to a line).
- stays_in_scope=false for anything that needs a change outside this change's scope.
- blocks_merge=true only if you would refuse to merge with it unfixed.

{ledger}{adjudicate}Answer with the JSON object only: verdict (one short paragraph), findings, and
adjudications (one entry per id listed under ADJUDICATE, else an empty list).
"""

ADJUDICATE = """ADJUDICATE - the author rejected these findings. For each, decide on the
evidence: "withdrawn" if the rejection is right, "upheld" if the finding stands
(say why the evidence does not answer it). Do not re-raise them as new findings.
{items}
"""


class EngineError(Exception):
    def __init__(self, message: str, code: int = 2):
        super().__init__(message)
        self.code = code


# --------------------------------------------------------------------------- git

def git(*args: str, cwd: str | os.PathLike | None = None, input: bytes | None = None,
        check: bool = True) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, input=input, capture_output=True)
    if check and result.returncode != 0:
        raise EngineError(f"git {' '.join(args)} failed: {result.stderr.decode('utf-8', 'replace').strip()}")
    return result.stdout.decode("utf-8", "replace")


def repo_root(cwd=None) -> pathlib.Path:
    return pathlib.Path(git("rev-parse", "--show-toplevel", cwd=cwd).strip())


def git_dir(root: pathlib.Path) -> pathlib.Path:
    d = pathlib.Path(git("rev-parse", "--git-dir", cwd=root).strip())
    return d if d.is_absolute() else (root / d)


def repo_slug(root: pathlib.Path) -> str:
    """owner/repo from origin (a proxy URL such as http://proxy@127.0.0.1:1234/git/owner/repo works too)."""
    env = os.environ.get("GITHUB_REPOSITORY")
    if env:
        return env
    url = git("remote", "get-url", "origin", cwd=root, check=False).strip()
    m = re.search(r"([^/:]+)/([^/]+?)(?:\.git)?/?$", url)
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def current_branch(root: pathlib.Path) -> str:
    return git("rev-parse", "--abbrev-ref", "HEAD", cwd=root).strip()


def default_base(root: pathlib.Path) -> str:
    for ref in ("origin/develop", "origin/main", "origin/master"):
        if git("rev-parse", "--verify", "--quiet", ref, cwd=root, check=False).strip():
            return ref
    raise EngineError("no base branch found (origin/develop, origin/main); pass --base")


# Every switch that changes the rendered diff, pinned - the id must come out the
# same in an author's checkout and on a hosted runner (Jeongyeon r6 on
# codex-review#7: diff.context=0 locally dropped the context lines CI hashes).
DIFF_FLAGS = ("--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--binary",
              "--full-index", "--diff-algorithm=myers", "--src-prefix=a/", "--dst-prefix=b/",
              "--unified=3", "--inter-hunk-context=0", "--indent-heuristic", "--no-relative",
              "--ignore-submodules=none", "--submodule=short", "--ws-error-highlight=none")
DIFF_CONFIG = ("diff.noprefix=false", "diff.mnemonicPrefix=false", "diff.context=3", "diff.interHunkContext=0",
               "diff.indentHeuristic=true", "diff.suppressBlankEmpty=false",
               "diff.relative=false", "diff.algorithm=myers", "core.quotePath=true")
EXCLUDE = f":(exclude){RECORD_DIR}"


def merge_base(root: pathlib.Path, base: str, head: str) -> str:
    return git("merge-base", base, head, cwd=root).strip()


def diff_environment(empty_file: pathlib.Path) -> dict:
    """No global/system git config and no diff-shaping environment for the id's diff."""
    env = {k: v for k, v in os.environ.items()
           if k not in ("GIT_DIFF_OPTS", "GIT_EXTERNAL_DIFF", "GIT_CONFIG_PARAMETERS", "GIT_CONFIG_COUNT")
           and not k.startswith(("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_"))}
    env.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=str(empty_file))
    return env


def change_diff(root: pathlib.Path, mb: str, head: str) -> bytes:
    cfg = [arg for kv in DIFF_CONFIG for arg in ("-c", kv)]
    # One real empty file serves as the global config and, through -O, as the
    # order file (beats any configured diff.orderFile; an empty config value is
    # an error, and os.devnull is a device name on Windows).
    with tempfile.TemporaryDirectory() as tmp:
        order = pathlib.Path(tmp) / "order"
        order.write_bytes(b"")
        out = subprocess.run(["git", *cfg, "diff", *DIFF_FLAGS, f"-O{order}", mb, head, "--", ".", EXCLUDE],
                             cwd=root, capture_output=True, env=diff_environment(order))
    if out.returncode != 0:
        raise EngineError(f"git diff failed: {out.stderr.decode('utf-8', 'replace').strip()}")
    return out.stdout


HUNK = re.compile(rb"^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@")


def patch_id(root: pathlib.Path, mb: str, head: str) -> str | None:
    """The change's identity, or None when the change is empty (outside .review/).

    sha256 of the exact diff text with only what a base merge moves taken out:
    `index` lines (blob ids) and hunk-header line numbers. A base change inside a
    hunk's context lines still moves it (Codex cloud review on boracaya-e2e#494);
    hashing only the +/- lines would instead let an edit move unnoticed. Unlike `git
    patch-id --stable` it keeps whitespace, so an indentation-only edit - which
    changes what Python or YAML means - is a new change needing a new review
    (Jeongyeon r3 on codex-review#7).
    """
    diff = change_diff(root, mb, head)
    if not diff.strip():
        return None
    h = hashlib.sha256()
    for line in diff.split(b"\n"):
        if line.startswith(b"index "):
            continue
        h.update(HUNK.sub(b"@@", line) + b"\n")
    return h.hexdigest()


def changed_files(root: pathlib.Path, mb: str, head: str) -> list[str]:
    out = git("diff", "--name-only", "--no-renames", mb, head, "--", ".", EXCLUDE, cwd=root)
    return [l for l in out.splitlines() if l.strip()]


def dirty_paths(root: pathlib.Path) -> list[str]:
    out = git("status", "--porcelain", "--untracked-files=normal", cwd=root)
    paths = [l[3:] for l in out.splitlines() if l.strip()]
    return [p for p in paths if not p.startswith(RECORD_DIR + "/") and p != RECORD_DIR + "/"]


# ------------------------------------------------------------------------ globs

def glob_regex(pattern: str) -> re.Pattern:
    """Version-independent glob: `**/` spans zero or more directories, `*` and `?` stay in one segment."""
    i, out = 0, []
    while i < len(pattern):
        if pattern.startswith("**/", i):
            out.append("(?:.*/)?"); i += 3
        elif pattern.startswith("**", i):
            out.append(".*"); i += 2
        elif pattern[i] == "*":
            out.append("[^/]*"); i += 1
        elif pattern[i] == "?":
            out.append("[^/]"); i += 1
        else:
            out.append(re.escape(pattern[i])); i += 1
    return re.compile("".join(out) + r"\Z")


def matches_any(path: str, patterns: list[str]) -> bool:
    return any(glob_regex(p).match(path) for p in patterns)


# ----------------------------------------------------------------------- policy

def _deep_merge(base: dict, over: dict) -> dict:
    out = json.loads(json.dumps(base))
    for k, v in (over or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def validate_policy(doc: dict) -> None:
    """Raise EngineError for anything but a well-formed v1 policy - never another
    exception type, so every reader's fallback catches it (adversarial review F7)."""
    if not isinstance(doc, dict) or doc.get("version") != 1:
        raise EngineError("review policy: unsupported version", 2)
    defaults, repos = doc.get("defaults", {}), doc.get("repos", {})
    if not isinstance(defaults, dict) or not isinstance(repos, dict):
        raise EngineError("review policy: defaults and repos must be objects")
    for scope_name, scope in [("defaults", defaults)] + [(f"repos[{k}]", v) for k, v in repos.items()]:
        if not isinstance(scope, dict):
            raise EngineError(f"review policy: {scope_name} is not an object")
        if "jeongyeon" in scope and scope["jeongyeon"] not in ("on", "off"):
            raise EngineError(f"review policy: {scope_name}.jeongyeon must be on|off")
        if "record_check" in scope and scope["record_check"] not in MODES:
            raise EngineError(f"review policy: {scope_name}.record_check must be one of {MODES}")
        for key in ("max_exchanges", "round_timeout_minutes", "round_cap"):
            value = scope.get(key)
            if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 1):
                raise EngineError(f"review policy: {scope_name}.{key} must be a positive integer")
        axes = scope.get("axes")
        if axes is not None and (not isinstance(axes, list) or not axes
                                 or any(a not in review_config.ALL_AXES for a in axes)):
            raise EngineError(f"review policy: {scope_name}.axes must be a list of {review_config.ALL_AXES}")
        reviewer = scope.get("reviewer", {})
        if not isinstance(reviewer, dict):
            raise EngineError(f"review policy: {scope_name}.reviewer must be an object")
        for vendor, conf in reviewer.items():
            if vendor not in VENDORS or not isinstance(conf, dict):
                raise EngineError(f"review policy: {scope_name}.reviewer.{vendor} is not a known vendor")
            for key in ("model", "effort"):
                if key in conf and not isinstance(conf[key], str):
                    raise EngineError(f"review policy: {scope_name}.reviewer.{vendor}.{key} must be a string")


def fetch_policy(state_dir: pathlib.Path, timeout: float = 10.0) -> tuple[dict | None, dict]:
    """(document, source). Live (branch head pinned by SHA, so no CDN staleness), then the
    file a Codex setup script fetched, then the last cached copy.

    source "absent": the live lookup succeeded and no policy is published - the
    defaults are the truth. source "none": nothing could be read - the caller does
    not know the policy, and a merge gate must not guess low (Jeongyeon r4 on
    codex-review#7)."""
    cache = state_dir / "policy.json"
    try:
        out = subprocess.run(["git", "ls-remote", POLICY_GIT, f"refs/heads/{POLICY_BRANCH}"],
                             capture_output=True, timeout=timeout)
        if out.returncode == 0 and not out.stdout.strip():
            return None, {"source": "absent", "commit": ""}
        sha = out.stdout.decode().split()[0] if out.returncode == 0 else ""
        if sha:
            try:
                with urllib.request.urlopen(POLICY_RAW.format(sha=sha), timeout=timeout) as resp:
                    doc = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 404:  # the branch exists but holds no policy file
                    return None, {"source": "absent", "commit": sha}
                raise
            validate_policy(doc)
            state_dir.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps({"commit": sha, "doc": doc}), encoding="utf-8")
            return doc, {"source": "live", "commit": sha}
    except Exception:  # noqa: BLE001 - any failure falls through to the next source (F7, F8)
        pass
    env_file = os.environ.get("ADVERSARIAL_REVIEW_POLICY_FILE") or str(SETUP_POLICY_FILE)
    for path, source in ((env_file, "setup-file"), (str(cache), "cache")):
        if not path or not pathlib.Path(path).exists():
            continue
        try:
            raw = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                continue
            doc, commit = (raw["doc"], str(raw.get("commit", ""))) if "doc" in raw else (raw, "")
            validate_policy(doc)
            return doc, {"source": source, "commit": commit}
        except Exception:  # noqa: BLE001 - a policy read must never crash a reader (F7, F8)
            continue
    return None, {"source": "none", "commit": ""}


def effective_policy(doc: dict | None, repo: str) -> dict:
    eff = json.loads(json.dumps(DEFAULT_POLICY))
    if doc:
        eff = _deep_merge(eff, doc.get("defaults") or {})
        eff = _deep_merge(eff, (doc.get("repos") or {}).get(repo) or {})
        eff["revision"] = doc.get("revision")
    return eff


# ------------------------------------------------------------------------ state

def state_path(root: pathlib.Path, branch: str) -> pathlib.Path:
    # The readable part alone collides (feature/a and feature_a); the hash of
    # the real name keeps every branch's loop apart (Jeongyeon r3 on codex-review#7).
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", branch)[:60]
    digest = hashlib.sha256(branch.encode("utf-8")).hexdigest()[:12]
    return git_dir(root) / "adversarial-review" / f"{safe}-{digest}" / "state.json"


def load_state(path: pathlib.Path, branch: str) -> dict:
    if path.exists():
        state = json.loads(path.read_text(encoding="utf-8"))
        if state.get("branch") == branch:
            return state
    return {"version": 1, "branch": branch, "rounds": [], "findings": {}, "records": [], "next_id": 1}


def save_state(path: pathlib.Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    tmp.replace(path)


OPEN_STATES = {"open", "upheld"}          # need an answer from the author
PENDING_STATES = {"rejected"}             # waiting for the reviewer's ruling
CLOSED_STATES = {"fixed", "withdrawn", "deferred", "owner"}


def unanswered(state: dict) -> list[dict]:
    return [f for f in state["findings"].values() if f["status"] in OPEN_STATES]


def escalated(state: dict) -> list[dict]:
    return [f for f in state["findings"].values() if f["status"] == "escalated"]


def next_axis(state: dict, axes: list[str]) -> str:
    """Each configured axis once, then `final`. After a passed record, a later change gets `final` only."""
    if state.get("records"):
        return "final"
    done = [r["axis"] for r in state["rounds"]]
    for a in axes:
        if a not in done:
            return a
    return "final"


def is_done(state: dict, axes: list[str], pid: str) -> bool:
    """A clean `final` pass on exactly this change, every finding closed, every axis run once."""
    if not state["rounds"]:
        return False
    last = state["rounds"][-1]
    if last["axis"] != "final" or last["new_findings"] != 0 or last.get("patch_id") != pid:
        return False
    if any(f["status"] not in CLOSED_STATES for f in state["findings"].values()):
        return False
    if state.get("records"):
        return True
    ran = {r["axis"] for r in state["rounds"]}
    return all(a in ran for a in axes)


# --------------------------------------------------------------------- reviewer

def ledger_text(state: dict) -> str:
    rows = []
    for f in state["findings"].values():
        if f["status"] in PENDING_STATES:
            continue
        disp = {"fixed": f"fixed in {f.get('answer', '')}", "withdrawn": "withdrawn by the reviewer",
                "deferred": f"deferred: {f.get('answer', '')}", "owner": f"owner decision: {f.get('answer', '')}"
                }.get(f["status"], f["status"])
        rows.append(f"- {f['id']} [{f['severity']}] {f['file']}:{f['line']} {f['title']} -> {disp}")
    if not rows:
        return ""
    return ("LEDGER - findings already raised in this loop. Do not re-raise them; you MAY attack a "
            "closure you think is wrong by raising a NEW finding that says why:\n" + "\n".join(rows) + "\n\n")


def adjudicate_text(state: dict) -> str:
    items = [f"- {f['id']} [{f['severity']}] {f['file']}:{f['line']} {f['title']}\n  claim: {f['claim']}\n"
             f"  author's rejection: {f.get('answer', '')}"
             for f in state["findings"].values() if f["status"] in PENDING_STATES]
    return ADJUDICATE.format(items="\n".join(items)) + "\n" if items else ""


def build_prompt(*, repo, branch, base, mb, head, axis, off_limits, state) -> str:
    return PROMPT.format(
        repo=repo or "(this repository)", branch=branch, base=base, merge_base=mb, head=head,
        axis=AXES[axis],
        off_limits=(f"OFF-LIMITS: {off_limits}. A finding that needs a change there is out of "
                    f"scope: report it with stays_in_scope=false.\n\n" if off_limits else ""),
        ledger=ledger_text(state), adjudicate=adjudicate_text(state))


REVIEWER_TOOLS = ["Read", "Grep", "Glob", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)",
                  "Bash(git status:*)", "Bash(git blame:*)", "Bash(git ls-files:*)"]


def reviewer_command(vendor: str, model: str, effort: str, schema_path: pathlib.Path,
                     out_path: pathlib.Path) -> list[str]:
    if vendor == "claude":
        cmd = [shutil.which("claude") or "claude", "-p", "--output-format", "json",
               "--json-schema", json.dumps(FINDINGS_SCHEMA), "--no-session-persistence",
               "--allowedTools", *REVIEWER_TOOLS, "--disallowedTools", "Edit", "Write", "NotebookEdit"]
        if model:
            cmd += ["--model", model]
        if effort:
            cmd += ["--effort", effort]
        return cmd
    if vendor == "codex":
        cmd = [shutil.which("codex") or "codex", "exec", "--sandbox", "read-only", "--skip-git-repo-check",
               "--output-schema", str(schema_path), "--output-last-message", str(out_path)]
        if model:
            cmd += ["-m", model]
        if effort:
            cmd += ["-c", f"model_reasoning_effort={effort}"]
        return cmd + ["-"]
    raise EngineError(f"unknown vendor {vendor!r}")


def _json_objects(text: str):
    """Every top-level JSON object in `text`, last first (fenced or bare)."""
    dec = json.JSONDecoder()
    found, i = [], 0
    while True:
        i = text.find("{", i)
        if i < 0:
            break
        try:
            obj, end = dec.raw_decode(text, i)
            found.append(obj)
            i = end
        except ValueError:
            i += 1
    return list(reversed(found))


def parse_reviewer_output(vendor: str, stdout: str, last_message: str = "") -> dict:
    candidates = []
    if vendor == "claude":
        try:
            envelope = json.loads(stdout)
        except ValueError:
            envelope = None
        if isinstance(envelope, dict):
            if envelope.get("is_error"):
                raise EngineError(f"reviewer reported an error: {str(envelope.get('result'))[:300]}", 3)
            if isinstance(envelope.get("structured_output"), dict):
                candidates.append(envelope["structured_output"])
            candidates += _json_objects(str(envelope.get("result") or ""))
    candidates += _json_objects(last_message) + _json_objects(stdout)
    for c in candidates:
        if isinstance(c, dict) and isinstance(c.get("findings"), list):
            return normalise(c)
    raise EngineError("reviewer returned no findings JSON", 3)


def normalise(doc: dict) -> dict:
    findings = []
    for f in doc.get("findings") or []:
        if not isinstance(f, dict) or not f.get("title"):
            continue
        sev = str(f.get("severity", "major")).lower()
        findings.append({
            "title": str(f["title"]).strip(), "file": str(f.get("file", "")).strip(),
            "line": int(f.get("line") or 0) if str(f.get("line", "0")).lstrip("-").isdigit() else 0,
            "claim": str(f.get("claim", "")).strip(),
            "severity": sev if sev in SEVERITIES else "major",
            "stays_in_scope": bool(f.get("stays_in_scope", True)),
            "blocks_merge": bool(f.get("blocks_merge", False)),
        })
    adj = [{"id": str(a.get("id", "")), "decision": a.get("decision"), "reason": str(a.get("reason", ""))}
           for a in doc.get("adjudications") or [] if isinstance(a, dict)
           and a.get("decision") in ("upheld", "withdrawn")]
    return {"verdict": str(doc.get("verdict", "")).strip(), "findings": findings, "adjudications": adj}


def run_reviewer(vendor: str, model: str, effort: str, prompt: str, root: pathlib.Path,
                 timeout_s: int, log_dir: pathlib.Path) -> dict:
    log_dir.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="review-", dir=str(log_dir)))
    schema_path, out_path = tmp / "schema.json", tmp / "last-message.json"
    schema_path.write_text(json.dumps(FINDINGS_SCHEMA), encoding="utf-8")
    (tmp / "prompt.md").write_text(prompt, encoding="utf-8")
    cmd = reviewer_command(vendor, model, effort, schema_path, out_path)
    try:
        result = subprocess.run(cmd, input=prompt.encode("utf-8"), cwd=root, capture_output=True,
                                timeout=timeout_s)
    except FileNotFoundError:
        raise EngineError(f"{cmd[0]} not found: the {vendor} CLI must be on PATH", 3)
    except subprocess.TimeoutExpired:
        raise EngineError(f"reviewer timed out after {timeout_s}s (transcript dir {tmp})", 3)
    stdout = result.stdout.decode("utf-8", "replace")
    (tmp / "stdout.txt").write_text(stdout, encoding="utf-8")
    (tmp / "stderr.txt").write_bytes(result.stderr)
    last = out_path.read_text(encoding="utf-8") if out_path.exists() else ""
    if result.returncode != 0 and not last and not stdout.strip():
        raise EngineError(f"reviewer exited {result.returncode}: "
                          f"{result.stderr.decode('utf-8', 'replace')[-500:]}", 3)
    return parse_reviewer_output(vendor, stdout, last)


# ----------------------------------------------------------------------- record

def record_path(root: pathlib.Path, pid: str) -> pathlib.Path:
    return root / RECORD_DIR / f"{pid}.json"


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def build_record(*, pid, repo, branch, base, mb, head, verdict, vendor, reviewer, policy_src,
                 policy_rev, state, axes_run) -> dict:
    ledger = [{"id": f["id"], "round": f["round"], "axis": f["axis"], "severity": f["severity"],
               "location": f"{f['file']}:{f['line']}", "title": f["title"],
               "disposition": {"fixed": f"Fixed in {f.get('answer', '')}",
                               "withdrawn": f"Withdrawn by the reviewer: {f.get('ruling', '')}",
                               "deferred": f"Deferred: {f.get('answer', '')}",
                               "owner": f"Owner decision: {f.get('answer', '')}"}.get(f["status"], f["status"])}
              for f in state["findings"].values()]
    return {
        "schema": RECORD_SCHEMA, "engine_version": ENGINE_VERSION, "patch_id": pid, "repo": repo,
        "branch": branch, "base": base, "merge_base": mb, "head": head, "verdict": verdict,
        "author_vendor": vendor, "reviewer": reviewer,
        "policy": {"source": policy_src.get("source"), "commit": policy_src.get("commit"), "revision": policy_rev},
        "axes_run": axes_run, "rounds": len(state["rounds"]), "ledger": ledger, "created_at": now(),
    }


def write_and_commit_record(root: pathlib.Path, state: dict, record: dict, commit: bool) -> pathlib.Path:
    path = record_path(root, record["patch_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    stale = [p for p in state.get("records", []) if p != record["patch_id"]]
    if commit:
        for old in stale:
            rel = f"{RECORD_DIR}/{old}.json"
            if (root / rel).exists():
                git("rm", "-q", "--", rel, cwd=root)
        git("add", "--", f"{RECORD_DIR}/{record['patch_id']}.json", cwd=root)
        git("commit", "-q", "-m", f"Adversarial review record {record['patch_id'][:12]} "
            f"({record['verdict']}, {record['reviewer'].get('vendor', '-')} "
            f"{record['reviewer'].get('model') or 'default model'})", "--no-verify", cwd=root)
    if record["patch_id"] not in state.setdefault("records", []):
        state["records"].append(record["patch_id"])
    state["cap_from"] = len(state["rounds"])
    return path


def check_record(doc: dict, pid: str) -> list[str]:
    """Problems with a record for patch-id `pid` (empty = valid)."""
    problems = []
    if doc.get("schema") != RECORD_SCHEMA:
        problems.append(f"unknown schema {doc.get('schema')!r}")
    if doc.get("patch_id") != pid:
        problems.append(f"record is for patch-id {doc.get('patch_id')}, the diff is {pid}")
    if doc.get("verdict") not in ("pass", "skipped-docs-only"):
        problems.append(f"verdict is {doc.get('verdict')!r}, not pass")
    reviewer = doc.get("reviewer") or {}
    if doc.get("verdict") == "pass":
        if doc.get("author_vendor") not in VENDORS or reviewer.get("vendor") != doc.get("author_vendor"):
            problems.append("reviewer vendor does not match the author's vendor")
        if "final" not in (doc.get("axes_run") or []):
            problems.append("no `final` pass recorded")
        open_rows = [r["id"] for r in doc.get("ledger") or []
                     if not str(r.get("disposition", "")).startswith(("Fixed", "Withdrawn", "Deferred", "Owner"))]
        if open_rows:
            problems.append(f"ledger rows without a closing disposition: {', '.join(open_rows)}")
    return problems


# --------------------------------------------------------------------- commands

def _context(args) -> dict:
    root = repo_root()
    branch = current_branch(root)
    base = args.base or os.environ.get("ADVERSARIAL_REVIEW_BASE") or default_base(root)
    head = git("rev-parse", "HEAD", cwd=root).strip()
    mb = merge_base(root, base, head)
    cfg = review_config.load(root / ".github" / "codex-review.yml")
    repo = repo_slug(root)
    sp = state_path(root, branch)
    return {"root": root, "branch": branch, "base": base, "head": head, "mb": mb, "cfg": cfg,
            "repo": repo, "state_path": sp, "state": load_state(sp, branch)}


def resolve_vendor(arg: str | None) -> str:
    if arg:
        return arg
    if os.environ.get("CLAUDECODE") or os.environ.get("CLAUDE_CODE_ENTRYPOINT"):
        return "claude"
    if any(k.startswith("CODEX_") for k in os.environ):
        return "codex"
    raise EngineError("cannot tell which agent is running: pass --vendor claude|codex")


def cmd_policy(args) -> int:
    root = repo_root()
    doc, src = fetch_policy(state_path(root, current_branch(root)).parent.parent)
    print(json.dumps({"source": src, "effective": effective_policy(doc, repo_slug(root))}, indent=2))
    return 0


def cmd_status(args) -> int:
    c = _context(args)
    pid = patch_id(c["root"], c["mb"], c["head"])
    st = c["state"]
    print(f"repo {c['repo']}  branch {c['branch']}  base {c['base']} ({c['mb'][:12]})")
    print(f"patch-id {pid or '(empty change)'}")
    rec = record_path(c["root"], pid) if pid else None
    print(f"record   {'present' if rec and rec.exists() else 'none'}")
    print(f"rounds   {len(st['rounds'])}: " + ", ".join(f"r{r['n']} {r['axis']} (+{r['new_findings']})"
                                                       for r in st["rounds"]))
    for f in st["findings"].values():
        print(f"  {f['id']:>4} {f['status']:<9} [{f['severity']}] {f['file']}:{f['line']} {f['title']}")
    return 0


def cmd_respond(args) -> int:
    root = repo_root()
    sp = state_path(root, current_branch(root))
    state = load_state(sp, current_branch(root))
    f = state["findings"].get(args.id)
    if not f:
        raise EngineError(f"no finding {args.id}; `status` lists them")
    if args.owner is not None:
        if f["status"] != "escalated":
            raise EngineError(f"{args.id} is {f['status']}; --owner closes only escalated findings")
        f["status"], f["answer"] = "owner", args.owner
    elif f["status"] not in OPEN_STATES:
        raise EngineError(f"{args.id} is {f['status']}, not waiting for an answer")
    elif args.fixed is not None:
        f["status"], f["answer"] = "fixed", args.fixed
    elif args.rejected is not None:
        f["status"], f["answer"] = "rejected", args.rejected
    elif args.deferred is not None:
        if f["stays_in_scope"]:
            raise EngineError(f"{args.id} is in scope: fix it or reject it with evidence")
        f["status"], f["answer"] = "deferred", args.deferred
    f.setdefault("responses", []).append({"at": now(), "status": f["status"], "answer": f.get("answer", "")})
    save_state(sp, state)
    print(f"{args.id} -> {f['status']}")
    return 0


def cmd_round(args) -> int:
    c = _context(args)
    root, state, cfg = c["root"], c["state"], c["cfg"]
    vendor = resolve_vendor(args.vendor)
    if c["branch"] in PROTECTED_BRANCHES or c["branch"] == "HEAD":
        raise EngineError(f"run the review on a feature branch, not {c['branch']}")
    dirty = dirty_paths(root)
    if dirty:
        raise EngineError("commit or stash your changes first; the reviewer reviews commits: "
                          + ", ".join(dirty[:8]))
    if escalated(state):
        raise EngineError("escalated to the owner: " + ", ".join(f["id"] for f in escalated(state))
                          + ". Ask the owner, then `respond <id> --owner \"<decision>\"`.", 4)
    if unanswered(state):
        raise EngineError("answer these first (`respond <id> --fixed <sha> | --rejected \"<evidence>\"`): "
                          + ", ".join(f["id"] for f in unanswered(state)), 10)

    doc, src = fetch_policy(c["state_path"].parent.parent)
    pol = effective_policy(doc, c["repo"])
    axes = pol.get("axes") or cfg.axes
    if "final" not in axes:
        axes = list(axes) + ["final"]
    round_cap = pol.get("round_cap") or cfg.round_cap
    rconf = (pol.get("reviewer") or {}).get(vendor) or {}
    model = args.model or os.environ.get("REVIEW_MODEL") or rconf.get("model") or ""
    effort = args.effort or os.environ.get("REVIEW_EFFORT") or rconf.get("effort") or ""
    reviewer = {"vendor": vendor, "model": model, "effort": effort}

    pid = patch_id(root, c["mb"], c["head"])
    if pid is None:
        print("nothing to review: the branch has no change against " + c["base"])
        return 0
    files = changed_files(root, c["mb"], c["head"])
    if files and all(matches_any(p, cfg.skip_paths) for p in files):
        rec = build_record(pid=pid, repo=c["repo"], branch=c["branch"], base=c["base"], mb=c["mb"],
                           head=c["head"], verdict="skipped-docs-only", vendor=vendor, reviewer=reviewer,
                           policy_src=src, policy_rev=pol.get("revision"), state=state, axes_run=[])
        path = write_and_commit_record(root, state, rec, commit=not args.no_commit)
        save_state(c["state_path"], state)
        print(f"docs-only change: record {path.relative_to(root)} written without a reviewer pass")
        return 0
    already, why = verify(root, c["base"], c["head"], cfg)
    if already:
        # Covers a fresh session continuing a branch: the loop state lives in .git/, the record in the tree.
        print(f"already reviewed: {why}")
        return 0

    timeout_s = int(pol.get("round_timeout_minutes") or 30) * 60
    max_exchanges = int(pol.get("max_exchanges") or 2)
    while True:
        if len(state["rounds"]) - state.get("cap_from", 0) >= round_cap and not args.axis:
            save_state(c["state_path"], state)
            raise EngineError(f"round cap ({round_cap}) reached without a clean final pass. Ask the owner; "
                              f"a further pass needs `round --axis <axis>`.", 5)
        axis = args.axis or next_axis(state, axes)
        head = git("rev-parse", "HEAD", cwd=root).strip()
        prompt = build_prompt(repo=c["repo"], branch=c["branch"], base=c["base"], mb=c["mb"], head=head,
                              axis=axis, off_limits=cfg.off_limits, state=state)
        n = len(state["rounds"]) + 1
        print(f"r{n} {axis}: {vendor} reviewer {model or '(default model)'} {effort or ''}".rstrip(), flush=True)
        started = now()
        out = run_reviewer(vendor, model, effort, prompt, root, timeout_s,
                           c["state_path"].parent / "transcripts" / f"r{n}-{axis}")
        rulings = {a["id"]: a for a in out["adjudications"]}
        for f in state["findings"].values():
            if f["status"] not in PENDING_STATES:
                continue
            ruling = rulings.get(f["id"])
            if ruling and ruling["decision"] == "withdrawn":
                f["status"], f["ruling"] = "withdrawn", ruling["reason"]
            else:  # upheld, or no ruling: the finding stands
                f["exchanges"] = f.get("exchanges", 0) + 1
                f["ruling"] = (ruling or {}).get("reason", "no ruling given; the finding stands")
                f["status"] = "escalated" if f["exchanges"] >= max_exchanges else "upheld"
        new_ids = []
        for item in out["findings"]:
            fid = f"F{state['next_id']}"
            state["next_id"] += 1
            state["findings"][fid] = {"id": fid, "round": n, "axis": axis, "status": "open",
                                      "exchanges": 0, **item}
            new_ids.append(fid)
        state["rounds"].append({"n": n, "axis": axis, "head": head, "patch_id": pid, "reviewer": reviewer,
                                "policy": src, "verdict": out["verdict"], "new_findings": len(new_ids),
                                "started": started, "finished": now()})
        save_state(c["state_path"], state)
        print(f"   verdict: {out['verdict'][:400]}")
        for fid in new_ids:
            f = state["findings"][fid]
            print(f"   {fid} [{f['severity']}{', blocks merge' if f['blocks_merge'] else ''}"
                  f"{', out of scope' if not f['stays_in_scope'] else ''}] {f['file']}:{f['line']} "
                  f"{f['title']}\n        {f['claim']}")
        for f in state["findings"].values():
            if f["status"] in ("upheld", "escalated") and f.get("ruling") and f.get("ruled_round") != n:
                f["ruled_round"] = n
                print(f"   {f['id']} {f['status'].upper()}: {f['ruling']}")
        save_state(c["state_path"], state)
        if escalated(state):
            print("ESCALATE: the reviewer upheld a rejected finding "
                  f"{max_exchanges} times. Ask the owner, then `respond <id> --owner \"<decision>\"`.")
            return 4
        if unanswered(state):
            print("Answer every finding: fix it and commit (`respond <id> --fixed <sha>`), or reject it with "
                  "evidence (`respond <id> --rejected \"...\"`); out-of-scope findings may be "
                  "`--deferred <issue>`. Then run `round` again.")
            return 10
        if args.axis:
            args.axis = None
        if is_done(state, axes, pid):
            rec = build_record(pid=pid, repo=c["repo"], branch=c["branch"], base=c["base"], mb=c["mb"],
                               head=head, verdict="pass", vendor=vendor, reviewer=reviewer, policy_src=src,
                               policy_rev=pol.get("revision"), state=state,
                               axes_run=sorted({r["axis"] for r in state["rounds"]},
                                               key=lambda a: review_config.ALL_AXES.index(a)))
            path = write_and_commit_record(root, state, rec, commit=not args.no_commit)
            save_state(c["state_path"], state)
            print(f"PASS: {path.relative_to(root)} written{'' if args.no_commit else ' and committed'}. Push when ready.")
            return 0


def verify(root: pathlib.Path, base: str, head: str, cfg) -> tuple[bool, str]:
    mb = merge_base(root, base, head)
    pid = patch_id(root, mb, head)
    if pid is None:
        return True, "empty change"
    files = changed_files(root, mb, head)
    if files and all(matches_any(p, cfg.skip_paths) for p in files):
        return True, f"docs-only change (patch-id {pid[:12]})"
    raw = git("show", f"{head}:{RECORD_DIR}/{pid}.json", cwd=root, check=False)
    if not raw.strip():
        return False, (f"no review record for this diff: {RECORD_DIR}/{pid}.json is missing. Run the "
                       f"adversarial review (Claude: the adversarial-review skill; Codex: AGENTS.md).")
    try:
        doc = json.loads(raw)
    except ValueError:
        return False, f"{RECORD_DIR}/{pid}.json is not valid JSON"
    problems = check_record(doc, pid)
    # The same textual patch has the same patch-id in every repository; a record
    # copied from another repo's PR must not stand in for a review of this one
    # (Codex cloud review on boracaya-e2e#494).
    expected = repo_slug(root)
    if expected and doc.get("repo") != expected:
        problems.append(f"record is for repo {doc.get('repo')!r}, this is {expected!r}")
    if doc.get("verdict") == "skipped-docs-only":
        # Reaching here means `cfg` (the BASE config in CI) does not call this
        # diff docs-only; a skipped record made under a widened head config
        # must not stand in for a review (Jeongyeon r1 on codex-review#7).
        problems.append("the record skipped the review as docs-only, but this diff touches more than skip_paths")
    if problems:
        return False, f"{RECORD_DIR}/{pid}.json: " + "; ".join(problems)
    rv = doc.get("reviewer") or {}
    return True, (f"{RECORD_DIR}/{pid}.json: {doc['verdict']}, reviewer {rv.get('vendor')} "
                  f"{rv.get('model') or '(default model)'}, {doc.get('rounds', 0)} rounds")


ENGINE_FILES = ("adversarial_review.py", "review_config.py", "claude_guard.py")


def engine_digest(directory: pathlib.Path = HERE) -> str:
    """One hash over every file a caller vendors (adversarial review F6: the guard counts too).
    In codex-review itself review_config.py lives in ../review; in a caller a missing file is drift."""
    h = hashlib.sha256()
    for name in ENGINE_FILES:
        p = directory / name
        if not p.exists() and directory == HERE:
            p = HERE.parent / "review" / name
        h.update(name.encode() + b"\0")
        h.update(p.read_bytes().replace(b"\r\n", b"\n") if p.exists() else b"<missing>")
    return h.hexdigest()


def cmd_verify(args) -> int:
    root = repo_root()
    cfg = review_config.load(root / ".github" / "codex-review.yml")
    mode = args.mode
    if mode is None:
        doc, _ = fetch_policy(git_dir(root) / "adversarial-review")
        mode = effective_policy(doc, repo_slug(root)).get("record_check", "report")
    if mode == "off":
        print("review record check is off for this repo")
        return 0
    targets = []
    if args.pre_push:
        for line in sys.stdin.read().splitlines():
            # `<local ref> <local sha> <remote ref> <remote sha>`; deletions push a zero sha.
            parts = line.split()
            if len(parts) != 4 or set(parts[1]) == {"0"} or not parts[2].startswith("refs/heads/"):
                continue
            branch = parts[2][len("refs/heads/"):]
            if branch not in PROTECTED_BRANCHES:
                targets.append((branch, parts[1]))
    else:
        targets.append(("HEAD", args.head or "HEAD"))
    if not targets:
        # Only protected branches or deletions: nothing to check, so no base is
        # needed either (a clone without one must not refuse the push).
        return 0
    try:
        base = args.base or os.environ.get("ADVERSARIAL_REVIEW_BASE") or default_base(root)
    except EngineError as e:
        # A shallow or single-branch clone has no origin/develop to diff
        # against. That is a setup gap, not a missing record: `report` warns
        # and lets the push through, `block` refuses with the fix (cdk#1921).
        if mode == "report":
            print(f"review record not checked: {e}. record_check is `report`: not blocking")
            return 0
        # Each alternative is a runnable command; `<develop|main|master>` was
        # notation that bash parses as redirections (Jeongyeon r3 on #8).
        raise EngineError(f"{e}. Fetch the branch this change targets - `git fetch origin develop`, "
                          "`git fetch origin main` or `git fetch origin master` - or name it with --base or "
                          "ADVERSARIAL_REVIEW_BASE, and push again")
    failed = False
    for name, head in targets:
        ok, msg = verify(root, base, head, cfg)
        print(f"{'ok' if ok else 'MISSING'}: {name}: {msg}")
        failed |= not ok
    if failed and mode == "report":
        print("record_check is `report`: not blocking")
        return 0
    return 1 if failed else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("status", "round"):
        p = sub.add_parser(name)
        p.add_argument("--base")
        if name == "round":
            p.add_argument("--vendor", choices=VENDORS)
            p.add_argument("--axis", choices=list(AXES))
            p.add_argument("--model")
            p.add_argument("--effort")
            p.add_argument("--no-commit", action="store_true")
    p = sub.add_parser("respond")
    p.add_argument("id")
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--fixed", metavar="SHA")
    g.add_argument("--rejected", metavar="EVIDENCE")
    g.add_argument("--deferred", metavar="ISSUE")
    g.add_argument("--owner", metavar="DECISION")
    p = sub.add_parser("verify")
    p.add_argument("--base")
    p.add_argument("--head")
    p.add_argument("--mode", choices=MODES)
    p.add_argument("--pre-push", action="store_true")
    sub.add_parser("policy")
    sub.add_parser("digest")
    args = ap.parse_args(argv)
    try:
        if args.cmd == "digest":
            print(engine_digest())
            return 0
        return {"status": cmd_status, "round": cmd_round, "respond": cmd_respond,
                "verify": cmd_verify, "policy": cmd_policy}[args.cmd](args)
    except review_config.ConfigError as e:
        print(f"error: .github/codex-review.yml: {e}", file=sys.stderr)
        return 2
    except EngineError as e:
        print(f"error: {e}", file=sys.stderr)
        return e.code


if __name__ == "__main__":
    sys.exit(main())
