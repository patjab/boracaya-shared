"""Per-repo review configuration: `.github/codex-review.yml` in the calling repo.

The runner's Python has no YAML library and this file must never need one, so
the format is the same flat subset versions.yml uses, plus lists:

    axes: [broad, tests, coupling, chain, unexamined, final]   # inline list
    context:                                                    # block list
      - src/shared/**
      - "packages/*/src/index.ts"
    off_limits: "the deploy workflows, the Cognito stack"       # scalar
    skip_paths: ["**/*.md", "docs/**"]
    round_cap: 8

Keys: axes (order of the automatic rounds; `final` is appended if missing),
context (globs of files handed to the reviewer in full, at the PR head),
tests (globs that classify a diff as test code; defaults in build_payload),
off_limits (free text named in the prompt), skip_paths (a PR touching only
these is not reviewed automatically), round_cap (automatic rounds per PR).
Anything else is an error, so a typo in a key never silently disables a rule.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

ALL_AXES = ["broad", "tests", "coupling", "chain", "unexamined", "final"]
DEFAULT_AXES = ["broad", "tests", "final"]
DEFAULT_SKIP = ["**/*.md", "docs/**", "LICENSE", "**/CHANGELOG*"]
KNOWN = {"axes", "context", "tests", "off_limits", "skip_paths", "round_cap",
         "payload_exclude"}


class ConfigError(ValueError):
    pass


@dataclass
class ReviewConfig:
    axes: list[str] = field(default_factory=lambda: list(DEFAULT_AXES))
    context: list[str] = field(default_factory=list)
    tests: list[str] = field(default_factory=list)
    off_limits: str = ""
    skip_paths: list[str] = field(default_factory=lambda: list(DEFAULT_SKIP))
    # Changed files kept OUT of the payload on purpose -- not dropped for size.
    # The receipt names each one and the glob that matched it, so a withheld
    # file is a decision a reader can see and disagree with, which is the only
    # kind of omission this harness may make silently-free (ops#39, N01).
    payload_exclude: list[str] = field(default_factory=list)
    round_cap: int = 8

    def next_axis(self, last_axis: str | None) -> str:
        """The automatic axis after `last_axis`: first of the sequence, then the next, then `final` forever."""
        if last_axis is None:
            return self.axes[0]
        if last_axis in self.axes:
            i = self.axes.index(last_axis)
            if i + 1 < len(self.axes):
                return self.axes[i + 1]
        return "final"


def _unquote(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    return s


def _strip_comment(line: str) -> str:
    # A `#` starts a comment unless it sits inside quotes.
    out, quote = [], None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def _inline_list(s: str) -> list[str]:
    inner = s.strip()[1:-1]
    return [_unquote(x) for x in re.split(r",\s*", inner) if x.strip()]


def parse(text: str) -> ReviewConfig:
    values: dict[str, object] = {}
    current: str | None = None
    for raw in text.splitlines():
        line = _strip_comment(raw)
        if not line.strip():
            continue
        if line.startswith(" ") or line.startswith("\t") or line.lstrip().startswith("- "):
            item = line.strip()
            if not item.startswith("- ") or current is None:
                raise ConfigError(f"unexpected line: {raw!r}")
            values.setdefault(current, [])
            if not isinstance(values[current], list):
                raise ConfigError(f"key {current} has both a scalar and list items")
            values[current].append(_unquote(item[2:]))  # type: ignore[union-attr]
            continue
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
        if not m:
            raise ConfigError(f"cannot parse line: {raw!r}")
        key, rest = m.group(1), m.group(2).strip()
        if key not in KNOWN:
            # An unknown key is a hard error on purpose: a typo'd key silently
            # ignored is a config that lies. But there is a second cause, and
            # it cost a red check to learn -- the caller workflows pin
            # `patjab/codex-review/review@main`, so the CODE comes from main
            # while the CONFIG comes from the PR head. A key added in the same
            # PR as its reader is therefore read by a version that predates it.
            # Land the reader first, the key second.
            raise ConfigError(
                f"unknown key {key!r}; known: {', '.join(sorted(KNOWN))}. "
                f"If this key is new in this PR: the review action is pinned to "
                f"@main, so it is running the reader from main, which does not "
                f"know it yet. Merge the reader first, then add the key.")
        if key in values:
            raise ConfigError(f"duplicate key {key!r}")
        current = key
        if rest == "":
            values[key] = []
        elif rest.startswith("[") and rest.endswith("]"):
            values[key] = _inline_list(rest)
            current = None
        else:
            values[key] = _unquote(rest)
            current = None
    cfg = ReviewConfig()
    for key, val in values.items():
        if key in ("axes", "context", "tests", "skip_paths", "payload_exclude"):
            if isinstance(val, str):
                val = [val]
            cfg.__setattr__(key, [str(v) for v in val])  # type: ignore[arg-type]
        elif key == "off_limits":
            if isinstance(val, list):
                val = ", ".join(val)
            cfg.off_limits = str(val)
        elif key == "round_cap":
            if isinstance(val, list) or not str(val).isdigit():
                raise ConfigError("round_cap must be a positive integer")
            cfg.round_cap = int(str(val))
    bad = [a for a in cfg.axes if a not in ALL_AXES]
    if bad:
        raise ConfigError(f"unknown axis {bad}; known: {', '.join(ALL_AXES)}")
    if not cfg.axes:
        cfg.axes = list(DEFAULT_AXES)
    if "final" not in cfg.axes:
        cfg.axes.append("final")
    if cfg.round_cap < 1:
        raise ConfigError("round_cap must be >= 1")
    return cfg


def load(path) -> ReviewConfig:
    import pathlib
    p = pathlib.Path(path)
    if not p.exists():
        return ReviewConfig()
    return parse(p.read_text(encoding="utf-8"))
