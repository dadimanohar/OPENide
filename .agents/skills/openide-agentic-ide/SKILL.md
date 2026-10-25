---
name: openide-agentic-ide
description: Diagnose, repair, test, and improve the OpenIDE local-first AI chat and agentic coding environment. Use for provider adapters, model discovery/latency, project-context tools, safe file changes, inference streaming/cancellation, REA workflows, and release verification.
---

# OpenIDE Agentic IDE Engineering

## Acceptance criteria

- Real provider/runtime calls only; no canned model output or silent provider fallback.
- Distinguish source assertions, compile-time success, test execution, and runtime evidence.
- Every changed agent path must preserve workspace path validation, secret exclusions, explicit approval before file writes, original-content conflict checks, backups, and failure reporting.
- Treat user code and remote model output as untrusted. A model's file/tool request is only a proposal; the native backend decides whether a path/read/write/command is permitted.

## Workflow

1. Trace the UI action, TypeScript/native binding, Rust command, endpoint, and result/error path before modifying behavior.
2. Reproduce the failure and find all callers, then make the smallest complete fix.
3. For provider add-ons, test root URLs and versioned URLs, credential handling, model discovery, exact model IDs, HTTP status handling, non-stream response parsing, each stream dialect, timeout, cancellation, and custom OpenAI-compatible endpoints. Never assume every compatible server exposes `/v1/models`; preserve manual model-ID entry.
4. For the coding agent, build prompt-ranked project context within hard caps, use concurrency for independent reads, keep read-only tools bounded, normalize tool responses, and explain when context/tool limits were reached. Make no file changes without human approval; never claim commands ran unless their actual output was returned.
5. Measure cold start, warm start, time to first token, total latency, token rate, memory, and CPU separately. Do not label a change “faster” without before/after measurements on the same hardware and model. Model download, file hashing, model loading, and inference are distinct costs.
6. Add a small regression test for each nontrivial branch. Run contract tests, typecheck/build, Rust tests, browser tests, and desktop acceptance tests; record anything that could not run.
7. Use REA only when an issue depends on shipped binaries/packages, reverse engineering, decompilation, or runtime behavior absent from source. For ordinary source code architecture work, use repository search and tests. Before configuring an REA MCP, inspect the dry-run plan and verify the live tool schema after reconnecting Antigravity.

## Never

- Do not fabricate credentials, model IDs, API responses, benchmark numbers, test results, or CI status.
- Do not send project contents to remote providers without the app's explicit consent path.
- Do not execute untrusted model-generated commands or import downloaded native binaries without integrity checks.
- Do not lower integrity, path-validation, cancellation, privacy, or approval gates just to make a demo appear faster.
