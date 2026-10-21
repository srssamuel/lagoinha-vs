# Plugins, agentes e skills para o Lagoinha VS (2026-10-21)

Estudo do que já existe nesta máquina, do que vale adotar e do que não vale, para o trabalho neste projeto:
motor Web Audio de palco, Firebase (Auth/Firestore/regras), Worker Cloudflare + R2 + D1, migrador do acervo e uso offline.

## Recomendação em uma linha por prioridade

| Prioridade | O quê | Por quê |
|---|---|---|
| P1 | Plugin oficial `firebase@firebase` | Auxilia validação e operação (ler regras, consultar Firestore, emulador). Não substitui os testes de autorização no emulador (`npm run test:rules`), que continuam obrigatórios |
| P1 | Conector Cloudflare atual | A troca para `https://mcp.cloudflare.com/mcp` depende da URL efetivamente instalada (ver "Estado verificado") |
| P1 | Playwright | Valida jornadas e comportamento do navegador (offline, service worker, tablet emulado). Homologação física exige o tablet e a interface USB reais |
| P2 | `signalsmith-stretch` (MIT, WASM + AudioWorklet) | Candidato a comparação com o motor atual, sem superioridade presumida; a decisão vem do teste A/B |
| P2 | `vite-plugin-pwa` (Workbox) | O app ainda não abre sem rede sozinho; falta service worker |

## Estado verificado nesta máquina (2026-10-21)

- Plugins `firebase@firebase` e `cloudflare@cloudflare`: **não instalados** (nenhum em `enabledPlugins`).
- Cloudflare: o conector exposto na sessão é o "Cloudflare Developer Platform" da conta claude.ai, e o próprio servidor se declara descontinuado ("Workers Bindings"). Nenhuma troca foi feita. A migração ativa não usa esse conector: usa o `wrangler` logado e a sessão própria do migrador, que não foram alterados.
- Playwright: já instalado (`playwright@1.63.0` global, usado por `scripts/demo-e2e.mjs`, e `@playwright/mcp` no MCP do usuário, Edge isolado). Nenhuma instalação nova é necessária.

## 1. Já temos e usar para

| Recurso | Uso neste projeto |
|---|---|
| Skills `test-driven-development`, `property-based-testing` | Domínio de áudio: quantização de pulos, mapa de semitons |
| Skills `systematic-debugging`, `verification-before-completion` | Bug de áudio com causa provada; nada de "pronto" sem comando que possa falhar |
| Skills `secure-by-default`, `audit-context-building`, `variant-analysis` | Auth, tokens, Worker de stems; achar variantes de uma falha |
| Skills `review-changes`, `requesting-code-review`, `spec-to-code-compliance` | Revisão de diff; comparar código com `docs/specs/` e `docs/architecture/contrato-stems-worker.md` |
| Skills `webapp-testing`, `visual-qa-playwright`, `web-design-guidelines` | QA visual 375/768/1440 e acessibilidade (sem roteiro de palco) |
| Skills `typescript-standards`, `writing-plans`, `docs-and-adr`, `handoff`, `commit` | Padrões, planos, ADRs, continuidade, commits |
| Agentes `principal-architect`, `qa-reliability`, `security-guardian`, `debugger`, `code-reviewer`, `researcher`, `visual-qa-auditor`, `flow-qa` | Arquitetura, QA com evidência, segurança, depuração, revisão, pesquisa, QA visual e de fluxo |
| MCP `codebase-memory` (`.mcp.json` do repo, só leitura) | `trace_path` e `search_graph` antes de varrer arquivos |
| MCPs `context7`, `ai-memory` | Docs atuais de libs; memória do projeto |

Sem uso aqui: skills e agentes de marketing, vídeo e monitoria; plugins de design e vídeo; MCPs de Figma, Vercel, Supabase.

## 2. Adotar

| Nome | Resolve | Custo e risco | Instalação | Prioridade |
|---|---|---|---|---|
| `firebase@firebase` | Validar/ler regras, Firestore, emulador | Plugin roda com a conta do usuário; revisar antes | `claude plugin marketplace add firebase/firebase-tools` e `claude plugin install firebase@firebase` | P1 |
| Cloudflare API MCP | Workers, R2, D1 pela API | Acesso amplo à conta; OAuth com escopo mínimo | `https://mcp.cloudflare.com/mcp` no `.mcp.json` | P1 |
| `cloudflare@cloudflare` | Skills `wrangler`, `workers-best-practices`, `workers-profiling` (Apache-2.0) | Descrições ocupam contexto | `/plugin marketplace add cloudflare/skills` e `/plugin install cloudflare@cloudflare` | P1 |
| Playwright CLI com skills ou `@playwright/mcp` | E2E, tablet emulado, offline | O MCP gasta mais contexto; a CLI é a recomendação do próprio projeto | `claude mcp add playwright npx @playwright/mcp@latest` | P1 |
| `signalsmith-stretch` | Candidato a comparação de pitch shift (MIT), sem superioridade presumida | Experimento isolado com o motor atual como referência: mesmos trechos, transposições, volumes e equipamento; medir qualidade percebida, latência, sincronismo, CPU, memória e offline | `npm i signalsmith-stretch` (só no experimento) | P2 |
| `vite-plugin-pwa` | Service worker e precache offline | Cache errado pode servir versão velha no palco; precisa de estratégia de atualização | `npm i -D vite-plugin-pwa` | P2 |
| `@soundtouchjs/audio-worklet` | Alternativa de pitch shift (MPL-2.0) | Qualidade em música polifônica não verificada | `npm i @soundtouchjs/audio-worklet` | P3, só comparação |
| `security-guidance`, `code-review`, `typescript-lsp` (marketplace oficial) | Lembretes de segurança, revisão de PR, navegação de tipos | Duplicam parte do que já temos | `/plugin install <nome>@claude-plugins-official` | P3 |

Antes de instalar qualquer plugin, ver o custo de contexto na aba Marketplaces do `/plugin`.

## 3. Não adotar

- MCP "Workers Bindings": descontinuado pela Cloudflare em favor de `mcp.cloudflare.com/mcp`.
- `rubberband-wasm` / `rubberband-web`: GPL. Distribuir o app exigiria cumprir a GPL. Há licença comercial do Rubber Band que pode ser avaliada no futuro, se a comparação de qualidade justificar o custo.
- `essentia.js`: AGPL v3. A detecção de tom fica em algoritmo próprio (cromagrama + perfis de tonalidade) em TypeScript, com teste. O Essentia também tem licenciamento comercial, que pode ser avaliado no futuro.
- Segundo store de memória: proibido pelo charter do cérebro.

## 4. Próprios do projeto (criados em `.claude/`)

- `.claude/agents/audio-engine-reviewer.md`: revisa mudanças no motor Web Audio contra os quatro princípios de palco do `AGENTS.md`. Só lê e roda testes.
- `.claude/agents/firebase-rules-reviewer.md`: revisa `firestore.rules`, papéis e convites, e o Worker de stems. Só lê e roda a suíte de regras.
- `.claude/skills/stage-qa/SKILL.md`: roteiro de teste de palco antes de culto ou ensaio, separando o que o teste prova do que só o ouvido confirma.

Já existiam antes deste estudo e continuam: `.claude/agents/stage-audio-engineer.md` (edita o motor) e `.claude/launch.json`.

### Permissões efetivas

- Os dois revisores têm `Read, Grep, Glob, Bash`. "Não edita" é instrução, não bloqueio: com `Bash` eles conseguiriam escrever. Por isso o roteiro deles só pede leitura e testes, e o resultado é conferido pelo diff antes do commit.
- `stage-audio-engineer` edita o motor. Não deve rodar ao mesmo tempo que outro agente com escrita nos mesmos arquivos. Em ciclos paralelos, cada frente recebe uma lista exclusiva de arquivos.

### Como reverter

Reverter só o que este estudo introduziu, preservando o resto de `.claude/`:

- `git revert afac3ed` (desfaz o estudo, os dois revisores e a skill `stage-qa`); ou
- apagar só `.claude/agents/audio-engine-reviewer.md`, `.claude/agents/firebase-rules-reviewer.md` e `.claude/skills/stage-qa/` e commitar.

Nunca apagar a pasta `.claude/` inteira: ela guarda `stage-audio-engineer.md` e `launch.json`, que são anteriores.

## Fontes (consultadas em 2026-10-21)

- https://code.claude.com/docs/en/sub-agents — frontmatter e local dos agentes
- https://code.claude.com/docs/en/skills — `SKILL.md`, campos e locais
- https://code.claude.com/docs/en/plugins — estrutura, escopos, custo de contexto, aviso de segurança
- https://github.com/anthropics/claude-plugins-official/tree/main/plugins
- https://github.com/cloudflare/mcp-server-cloudflare — `mcp.cloudflare.com/mcp` recomendado; Workers Bindings descontinuado
- https://github.com/cloudflare/skills — skills da Cloudflare (Apache-2.0)
- https://firebase.google.com/docs/ai-assistance/mcp-server — plugin e MCP do Firebase
- https://github.com/microsoft/playwright-mcp
- https://github.com/signalsmith-audio/signalsmith-stretch — MIT
- https://github.com/cutterbl/SoundTouchJS — MPL-2.0
- https://mtg.github.io/essentia.js/ — AGPL v3
- https://vite-pwa-org.netlify.app/guide/

## Limites

- Qualidade de pitch shift ao vivo e consumo no tablet são inferência até o teste A/B no hardware.
- Versões de `signalsmith-stretch` e `@soundtouchjs/*` precisam ser conferidas no npm antes de adotar.
- Os comandos de instalação dos plugins Firebase e Cloudflare não foram testados nesta máquina.
- A lista de MCPs do usuário não foi aberta por inteiro para não expor segredos; os citados vêm dos conectores da sessão.
