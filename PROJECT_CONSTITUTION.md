# Institutional Project Constitution & Engineering Standards

This project operates under the **Autonomous AI Workstation Architecture** (Spec-Driven Development + Superpowers + Elite Design System + Autonomous Cognitive Interceptor).

---

## 1. Absolute Directives (Non-Negotiable)

1. **Autonomous Cognitive Interceptor**:
   - The user provides high-level visionary requests. The AI agents must never execute shallowly or ask trivial questions.
   - All prompts trigger automatic intent classification, persona assumption (Design Lead, Principal Architect, QA Auditor, Security Guardian), and canonical skill application.

2. **Spec Before Code (Spec-Kit Standard)**:
   - No code or architectural changes may be implemented without a defined contract (`spec.md` / `plan.md`).
   - Every requirement must have verifiable acceptance criteria.

3. **Elite Visual Bar (DESIGN GATE, ADR-006)**:
   - Generic or template-like UIs are strictly prohibited. The visual direction is decided by the `elite-design-system` pipeline (real captured references -> `design/art-direction.md` -> generated images -> build -> `visual-qa.mjs` -> `design-critic.mjs` SHIP >= 8), never by a default. No default theme, layout or motion style is imposed: no dark-first, bento grid, spring physics, glass cards, purple gradient or fade-up-everywhere unless the art direction justifies it for this project.
   - All interfaces must implement:
     - A palette and typography chosen in `design/art-direction.md`, with contrast verified against WCAG AA.
     - Layout and motion serving the project's concept, with a reduced-motion fallback.
     - Zero horizontal overflow (`scrollWidth === clientWidth`) across 375px, 768px, and 1440px viewports.
     - Full WCAG AA accessibility compliance (minimum 4.5:1 text contrast).
     - Live standalone interactive HTML preview artifact (`preview.html`).

4. **Zero-Leak Security Guardrail**:
   - Never stage or commit `.env`, `.env.*`, API keys, private keys, or credentials.
   - All commits are verified deterministically by the pre-commit security hook.

5. **Two-Stage Code Review Protocol (Superpowers Standard)**:
   - Stage 1: Structural review (SRP, modularity, strict TypeScript typing, clean boundaries).
   - Stage 2: Security & edge-case defense (input validation, sanitization, memory limits).

6. **Shared Memory Continuity (`ai-memory`)**:
   - All major architectural decisions, schema changes, and completed milestones must be persisted to the local `ai-memory` bus so all AI agents (Antigravity, Cursor, Claude Code, Codex) retain full context.

---

## 2. Directory Governance

```text
├── .ai-memory.toml         # Allowlist marker for persistent shared memory
├── .cursor/rules/          # Modern Cursor MDC rules (00-Prompts, 01-Design, 02-Arch, 03-QA, 04-Sec, 05-AntiOvereng)
├── .git/hooks/pre-commit   # Deterministic secret-scanning guardrail
├── AGENTS.md               # Agent operating instructions & cognitive charter
├── CLAUDE.md               # Claude Code project guidelines
└── specs/                  # GitHub Spec-Kit executable contracts
```
