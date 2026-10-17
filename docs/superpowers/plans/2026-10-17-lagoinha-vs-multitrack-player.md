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

## Review Focus

1. **Vazamento de Click para o P.A.:** No modo Split (IEM/PA), verificar se o ganho do canal Click no canal R é estritamente zero (-Infinity dB).
2. **Deslocamento de Sincronismo (Drift):** Garantir que após 10 minutos de reprodução, nenhum stem sofra dessincronização por drift de buffers.
3. **Pulo Quantizado de Seção:** Ao comandar "Pular para o Refrão", a transição deve ocorrer no downbeat exato do próximo compasso, sem cortes abruptos.
4. **Comportamento do Solo/Mute:** Quando uma track está em Solo, todas as não-solo devem ser silenciadas, exceto se Click/Guia tiverem política de fone prioritário.
5. **Transição Suave do Pad Contínuo:** Ao ligar o Pad ambiente ou trocar de tom, a curva de ganho deve usar interpolação exponencial suave para evitar estalos (clicks/pops).

---

### Task 1: Documentação da Arquitetura e Decisões (ADR-001 e AGENTS.md)

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/adr/ADR-001-baseline.md`
- Create: `docs/specs/multitrack-engine-spec.md`

- [ ] **Step 1: Atualizar AGENTS.md com escopo, stack e instruções de execução**
- [ ] **Step 2: Preencher ADR-001 formalizando a decisão pelo motor Web Audio API com matriz de roteamento Split (IEM/PA)**
- [ ] **Step 3: Documentar a especificação do motor e canais de áudio em docs/specs/**

---

### Task 2: Configuração do Projeto Vite, React, TypeScript e Tailwind

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`
- Create: `src/index.css`

- [ ] **Step 1: Criar package.json com scripts de build, test e typecheck**
- [ ] **Step 2: Configurar tsconfig.json e tsconfig.node.json com strict mode**
- [ ] **Step 3: Configurar vite.config.ts e vitest.config.ts**
- [ ] **Step 4: Instalar dependências via pnpm/npm e validar script typecheck**

---

### Task 3: Entidades e Modelos do Domínio (Domain Layer)

**Files:**
- Create: `src/domain/entities/Song.ts`
- Create: `src/domain/entities/TrackStem.ts`
- Create: `src/domain/entities/Setlist.ts`
- Create: `src/domain/value-objects/AudioRouting.ts`
- Create: `src/domain/value-objects/SongSection.ts`
- Create: `tests/unit/domain/Song.test.ts`

- [ ] **Step 1: Escrever testes unitários para cálculo de tempo, seções e validação de stems**
- [ ] **Step 2: Implementar TrackStem (volume, pan, mute, solo, bus routing)**
- [ ] **Step 3: Implementar Song e SongSection (Intro, Verso, Refrão, Ponte, etc.)**
- [ ] **Step 4: Implementar Setlist e AudioRouting (Split IEM/PA vs Stereo)**
- [ ] **Step 5: Rodar testes unitários do domínio**

---

### Task 4: Serviços de Aplicação e Portas (Application Layer)

**Files:**
- Create: `src/application/ports/AudioEnginePort.ts`
- Create: `src/application/services/MetronomeScheduler.ts`
- Create: `src/application/services/QuantizedSectionService.ts`
- Create: `src/application/services/MixerBusService.ts`
- Create: `tests/unit/application/QuantizedSectionService.test.ts`
- Create: `tests/unit/application/MixerBusService.test.ts`

- [ ] **Step 1: Escrever testes para quantização de pulo de seção (jump on next bar)**
- [ ] **Step 2: Escrever testes para a matriz de barramentos do Mixer (Solo/Mute e Split)**
- [ ] **Step 3: Implementar QuantizedSectionService**
- [ ] **Step 4: Implementar MixerBusService com isolamento absoluto de Click/Guia**
- [ ] **Step 5: Executar testes de aplicação**

---

### Task 5: Camada de Infraestrutura e Motor Web Audio (Infrastructure Layer)

**Files:**
- Create: `src/infrastructure/audio/WebAudioEngine.ts`
- Create: `src/infrastructure/audio/ProceduralClickGenerator.ts`
- Create: `src/infrastructure/audio/PolyphonicAmbientPad.ts`
- Create: `src/infrastructure/mock/DemoWorshipSongs.ts`
- Create: `tests/unit/infrastructure/ProceduralClickGenerator.test.ts`

- [ ] **Step 1: Implementar gerador de Click sintético profissional (Bip agudo 1500Hz acentuado no tempo 1, bips médios 800Hz)**
- [ ] **Step 2: Implementar PolyphonicAmbientPad (drone atmosférico nos 12 tons com filtro passa-baixas e crossfade de 2s)**
- [ ] **Step 3: Implementar WebAudioEngine com ChannelSplitter e ChannelMerger para Split L/R e suporte a múltiplos stems**
- [ ] **Step 4: Implementar DemoWorshipSongs com repertório típico da Lagoinha (ex: "A Casa É Sua", "Vitorioso És", "Ousado Amor") com stems sintetizados em tempo real**
- [ ] **Step 5: Testar gerador de áudio e buffers**

---

### Task 6: Camada de Apresentação e Interface de Palco (Presentation Layer)

**Files:**
- Create: `src/presentation/components/StageHeader.tsx`
- Create: `src/presentation/components/TransportBar.tsx`
- Create: `src/presentation/components/SectionTimeline.tsx`
- Create: `src/presentation/components/MultitrackMixer.tsx`
- Create: `src/presentation/components/SetlistSidebar.tsx`
- Create: `src/presentation/components/AmbientPadBar.tsx`
- Create: `src/presentation/components/RoutingModal.tsx`
- Create: `src/presentation/App.tsx`
- Create: `src/main.tsx`

- [ ] **Step 1: Criar StageHeader com relógio do culto, BPM luminoso, compasso e tom da música**
- [ ] **Step 2: Criar TransportBar com botões táteis gigantes (Play, Pause, Stop, Pular Seção, Loop 1x, Panic)**
- [ ] **Step 3: Criar SectionTimeline com visualização clara das seções da música e indicador de pulo agendado**
- [ ] **Step 4: Criar MultitrackMixer com faders de volume verticais, Solo, Mute, Pan e VU meters**
- [ ] **Step 5: Criar AmbientPadBar para ativação instantânea do tom do louvor nas orações**
- [ ] **Step 6: Criar SetlistSidebar com repertório do culto e carregador de arquivos locais (WAV/MP3)**
- [ ] **Step 7: Montar App.tsx integrando estado reativo do motor de áudio com atalhos de teclado de palco (Space, R, N, P, 1-6)**

---

### Task 7: Verificação, Testes Automatizados e Build de Produção

**Files:**
- Test: `tests/unit/**/*.test.ts`

- [ ] **Step 1: Executar suite de testes unitários (Vitest)**
- [ ] **Step 2: Executar TypeScript typecheck (`tsc --noEmit`)**
- [ ] **Step 3: Executar build de produção (`npm run build`)**
- [ ] **Step 4: Validar geração do pacote estático sem erros**

---

### Task 8: Commit e Documentação de Entrega

**Files:**
- Modify: `docs/superpowers/plans/2026-10-17-lagoinha-vs-multitrack-player.md`
- Git commit

- [ ] **Step 1: Criar commit inicial convencional estruturado**
- [ ] **Step 2: Apresentar relatório executivo com evidências, comandos para rodar e arquitetura**
