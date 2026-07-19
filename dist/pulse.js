"use strict";
// The Pulse wall's per-event config (cdk#668, decisions cdk#671): lives on
// metadata.pulse. THE canonical contract (shared#96, cdk#1115) — Valet's editor
// writes this document, the guest wall renders it; both UIs previously declared
// their own copies. Polls and the time capsule were cut after founder review
// (cdk#685); a backend payload still carrying those keys is harmless (unknown
// keys are ignored).
Object.defineProperty(exports, "__esModule", { value: true });
