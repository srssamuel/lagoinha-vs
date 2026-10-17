# Lagoinha VS (Virtual Session & Multitracks Player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um aplicativo profissional de playback multitrack ("VS") para o ministério de louvor da Lagoinha João Pessoa, com motor de áudio sincronizado por Web Audio API, roteamento estéreo/multicanal (Click/Guia para retorno vs Instrumentos para PA), navegação quantizada por seções (Refrão, Ponte, etc.), pad contínuo para momentos de oração, e suporte a MIDI.

**Architecture:** Clean Architecture (`src/domain`, `src/application`, `src/infrastructure`, `src/presentation`) sobre React 19 + TypeScript estrito + Vite + Tailwind CSS. O motor de áudio utiliza a Web Audio API com roteamento em matriz através de `ChannelSplitterNode` e `ChannelMergerNode` para isolar Click/Guia (IEM Fones L) das Multitracks (P.A. Auditório R), garantindo latência zero e sincronismo milimétrico.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind CSS, Lucide React, Web Audio API, Vitest.

**Spec:** Baseado nas melhores práticas dos líderes de mercado (MultiTracks.com Playback, Loop Community Prime e Ableton Live), adaptado para voluntários e músicos de igreja com interface Stage-Ready de alto contraste.

## Global Constraints

- **Language & Runtime:** TypeScript estrito com ES2022 e Node.js v24+.
- **Zero Latency / Sample Accurate:** Todos os stems devem ser acoplados ao mesmo clock temporal de áudio (`AudioContext.currentTime`).
- **Segurança de Palco (Fail-Safe):** O Click e a Guia NUNCA podem vazar para o canal de P.A. (Auditório) no modo Split.
- **Operação 100% Offline:** O aplicativo deve funcionar perfeitamente sem conexão com a internet durante os cultos.
- **Design de Palco:** Tema escuro de alto contraste (Dark Stage), botões táteis grandes visíveis a distância e sob iluminação de palco.
