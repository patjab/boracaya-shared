#!/usr/bin/env python3
"""Claude Code PreToolUse hook: only the review engine writes `.review/` (cdk#1915).

A record in `.review/<patch-id>.json` is the claim "a reviewer of the author's
vendor passed exactly this diff". The engine writes and commits it; an author
agent writing one by hand would be forging the gate. This hook denies the
agent's own Write/Edit tools on `.review/`, and any shell command naming
`.review` that is not a plain read (cat, ls, jq, git show, ...) or an engine
call.

Its limit, stated plainly: a command that never names `.review` - a script
file, a patch file applied by path - cannot be judged from its text. The hook
closes the easy paths an agent cutting a corner would take; the record check in
CI and a sampled re-review are what make a forged record costly (cdk#1913).

Wired in each caller's `.claude/settings.json`:
  "PreToolUse": [{"matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
                  "hooks": [{"type": "command",
                             "command": "python3 \\"$CLAUDE_PROJECT_DIR/.adversarial-review/claude_guard.py\\""}]}]
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shlex
import subprocess
import sys

sys.dont_write_bytecode = True

RECORD_DIR = ".review"
ENGINE_DIR = ".adversarial-review"
ENGINE = "adversarial_review.py"
FILE_TOOLS = {"Write", "Edit", "MultiEdit", "NotebookEdit"}
# `.review` as a whole path segment wherever it appears - after `>`, `>>`,
# `1>`, `:` or anything else - but not inside a longer name (`.reviewers.md`,
# `.review-notes.md`). The old list of allowed preceding characters missed
# `>.review/x.json` (Jeongyeon r5 on codex-review#7).
# Case-insensitive: Windows and macOS filesystems open `.REVIEW/` as `.review/`
# (Jeongyeon r11 on #8).
MENTIONS = re.compile(r"(?<![\w.-])\.review(?![\w.-])", re.I)
# The engine directory, or the engine named anywhere: running or touching it is
# judged even when the command never spells `.review` (Jeongyeon r7 on #8).
ENGINE_MENTIONS = re.compile(r"(?<![\w.-])\.adversarial-review(?![\w.-])|adversarial_review\.py", re.I)
# Running the engine is the one way to write .review/: the command must BE an
# engine call. Judged on bash's own words (shlex, posix) rather than a regex,
# because every regex here eventually disagreed with bash about what runs
# (codex-review#8, Jeongyeon r3-r7): a quoted `REVIEW_MODEL='x python3 <engine> '`
# matched the pattern while bash ran the `cp` after it. The rules:
#   - one simple command: no operator, newline, `$`, backtick or redirection;
#   - leading VAR=value words only for ADVERSARIAL_REVIEW_BASE, REVIEW_MODEL,
#     REVIEW_EFFORT (never PATH, PYTHONPATH or a policy source: F10);
#   - then a system Python in isolated mode (`-I`), then exactly <project>/.adversarial-review/
#     adversarial_review.py - resolved, no `..`, no backslash (r3, r4, r5);
#   - and the engine directory committed and clean (engine_is_committed).
ENV_ALLOWED = ("ADVERSARIAL_REVIEW_BASE", "REVIEW_MODEL", "REVIEW_EFFORT")
PYTHON = re.compile(r"(?:/usr/bin/|/usr/local/bin/|/opt/homebrew/bin/)?python3?(?:\.\d+)?")
UNSAFE = re.compile(r"[\n\r`$;&|<>()]")


def words(cmd: str) -> list[str] | None:
    """The words bash would run for a simple command, or None when it is not one."""
    if UNSAFE.search(cmd):
        return None
    try:
        return shlex.split(cmd, posix=True)
    except ValueError:
        return None


def is_engine_call(cmd: str, project_dir: str, cwd: str | None = None) -> bool:
    """`cmd` runs the engine installed in this repo (.adversarial-review/), and nothing else."""
    argv = words(cmd)
    if not argv:
        return False
    i = 0
    while i < len(argv) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", argv[i], re.S):
        if argv[i].split("=", 1)[0] not in ENV_ALLOWED:
            return False
        i += 1
    # `-I`, isolated mode, and nothing else between the interpreter and the
    # engine: without it Python runs user-site sitecustomize.py and .pth files,
    # and honours PYTHON* variables, before the byte-checked engine ever loads
    # (Jeongyeon r10 on #8). The engine puts its own directory on sys.path.
    if len(argv) < i + 3 or not PYTHON.fullmatch(argv[i]) or argv[i + 1] != "-I":
        return False
    raw = argv[i + 2]
    # No `..` at all: normpath folds `pivot/..` away lexically, but the kernel
    # follows a symlinked `pivot` first and lands somewhere else (Jeongyeon r4
    # on #8). No backslash: Windows path rules would split on it (r5).
    if "\\" in raw or ".." in raw.split("/") or not raw.endswith(ENGINE):
        return False
    script = os.path.normpath(os.path.join(cwd or project_dir, raw))
    engine = os.path.normpath(os.path.join(project_dir, ENGINE_DIR, ENGINE))
    # Resolved against the project's real directory, not the engine's own real
    # path: a symlinked .adversarial-review/ or engine file resolves elsewhere.
    trusted = os.path.join(os.path.realpath(project_dir), ENGINE_DIR, ENGINE)
    return script == engine and os.path.realpath(script) == trusted and engine_is_committed(project_dir)


def engine_is_committed(project_dir: str) -> bool:
    """Every file in the engine directory is byte-for-byte what HEAD commits, and
    nothing else is there (Jeongyeon r5, r7, r8 on #8).

    The path checks prove where the script is, not what it runs: an earlier
    command could rewrite it, or drop a module beside it that it imports. The
    files on disk are hashed and compared with HEAD's blobs directly - not
    through `git diff`, which `update-index --assume-unchanged/--skip-worktree`
    can blind - and the directory may hold no file HEAD lacks, tracked or not.
    A committed edit shows in the PR's diff and fails the CI record check.
    Fails closed when git cannot answer.
    """
    root = pathlib.Path(project_dir)
    try:
        # --no-replace-objects: a refs/replace/<HEAD> entry would otherwise
        # answer with a forged commit's tree (Jeongyeon r11 on #8).
        listing = subprocess.run(["git", "--no-replace-objects", "-C", project_dir, "ls-tree", "-r", "-z", "HEAD",
                                  "--", f"{ENGINE_DIR}/"],
                                 capture_output=True, text=True, timeout=10)
        if listing.returncode != 0:
            return False
        committed = {}
        for entry in filter(None, listing.stdout.split("\0")):
            meta, path = entry.split("\t", 1)
            committed[path] = meta.split()[2]
        if f"{ENGINE_DIR}/{ENGINE}" not in committed:
            return False
        on_disk = {p.relative_to(root).as_posix() for p in (root / ENGINE_DIR).rglob("*") if not p.is_dir()}
        if on_disk != set(committed):
            return False
        for path, blob in committed.items():
            if blob not in blob_ids((root / path).read_bytes()):
                return False
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return False
    return True


def blob_ids(data: bytes) -> set[str]:
    """Git's blob id for these bytes, as-is and with CRLF folded to LF (an autocrlf
    checkout). Computed here, not by `git hash-object`: a clean filter in the
    repo's .gitattributes could map tampered bytes onto the committed blob."""
    out = set()
    for body in (data, data.replace(b"\r\n", b"\n")):
        out.add(hashlib.sha1(b"blob %d\0" % len(body) + body).hexdigest())
    return out


# An ALLOWLIST, not a list of write commands: three rounds found writers the
# list lacked (`>.review`, then `git apply` - Jeongyeon r5, r7 on
# codex-review#7). Every shell segment that names .review must be one of these
# readers, with no redirection; anything else naming it is denied.
READERS = re.compile(r"^\s*(?:cat|ls|head|tail|wc|jq|grep|rg|stat|file|diff|sha256sum|md5sum|"
                     r"git\s+(?:show|log|diff|status|ls-files|blame|cat-file))\b[^<>`$()]*$")
# Reader flags that write or run something: git's --output=<file>, rg's
# --pre=<command> (local adversarial review F9). less/more are out of the list
# altogether (-o/-O write a log file).
WRITING_FLAGS = re.compile(r"(?:^|\s)--(?:output|pre|pre-glob)\b")
SEGMENTS = re.compile(r"\|\||&&|[;|&\n]")


def dequoted(cmd: str) -> str:
    """The command with the quoting bash removes before it opens a path: `.re\\view`,
    `.re''view` and `".review"` all name .review (Jeongyeon r8 on #8)."""
    return re.sub(r"[\\'\"]", "", cmd)


def bash_denied(cmd: str, project_dir: str = ".", cwd: str | None = None) -> bool:
    plain = dequoted(cmd)
    if not any(rx.search(text) for rx in (MENTIONS, ENGINE_MENTIONS) for text in (cmd, plain)):
        return False
    if is_engine_call(cmd, os.path.abspath(project_dir), cwd):
        return False
    if "<<" in cmd or "`" in cmd or "$(" in cmd:
        return True  # heredocs and substitutions hide what they write
    # Outside a verified engine call, the record and engine directories may only be read.
    return any((MENTIONS.search(dequoted(seg)) or ENGINE_MENTIONS.search(dequoted(seg)))
               and (not READERS.match(seg) or WRITING_FLAGS.search(seg))
               for seg in SEGMENTS.split(cmd))


def denied(event: dict, project_dir: str) -> str | None:
    tool = event.get("tool_name", "")
    data = event.get("tool_input") or {}
    if tool in FILE_TOOLS:
        path = data.get("file_path") or data.get("notebook_path") or ""
        full = os.path.normpath(os.path.join(project_dir, path))
        # case-folded: `.REVIEW/x.json` is `.review/x.json` on Windows and macOS (Jeongyeon r11 on #8)
        rel = os.path.relpath(full, project_dir).replace("\\", "/").lower()
        if rel == ENGINE_DIR or rel.startswith(ENGINE_DIR + "/"):
            return (f"{rel} is the vendored review engine; it changes only through codex-review's install.py "
                    "(Jeongyeon r5 on codex-review#8).")
        if rel == RECORD_DIR or rel.startswith(RECORD_DIR + "/"):
            return (f"{rel} is written only by the adversarial review engine. Run the adversarial-review "
                    f"skill (python3 -I .adversarial-review/{ENGINE} round --vendor claude) instead.")
        return None
    if tool == "Bash":
        cmd = str(data.get("command", ""))
        if bash_denied(cmd, project_dir, event.get("cwd")):
            return ("this command writes under .review/, which only the adversarial review engine does. "
                    f"Run python3 -I .adversarial-review/{ENGINE} round --vendor claude instead.")
    return None


def main() -> int:
    try:
        event = json.load(sys.stdin)
    except ValueError:
        return 0
    reason = denied(event, os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or os.getcwd())
    if reason:
        json.dump({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny",
                                          "permissionDecisionReason": reason}}, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
