# Plugins, agentes e skills para o Lagoinha VS (2026-10-21)

Estudo do que já existe nesta máquina, do que vale adotar e do que não vale, para o trabalho neste projeto:
motor Web Audio de palco, Firebase (Auth/Firestore/regras), Worker Cloudflare + R2 + D1, migrador do acervo e uso offline.

## Recomendação em uma linha por prioridade

| Prioridade | O quê | Por quê |
|---|---|---|
| P1 | Plugin oficial `firebase@firebase` | Valida e lê as regras do Firestore pelo agente; hoje só temos a suíte no emulador |
| P1 | MCP `https://mcp.cloudflare.com/mcp` + plugin `cloudflare@cloudflare` | Substitui o "Workers Bindings", que a Cloudflare marcou como descontinuado; traz as skills `wrangler` e `workers-best-practices` |
| P1 | Playwright (CLI com skills, ou `@playwright/mcp`) | Teste E2E de palco: tablet emulado, offline, troca de tom; hoje a demo usa um script próprio |
| P2 | `signalsmith-stretch` (MIT, WASM + AudioWorklet) | Pitch shift de qualidade no lugar do granular próprio; exige teste A/B de ouvido e medida de CPU no tablet |
| P2 | `vite-plugin-pwa` (Workbox) | O app ainda não abre sem rede sozinho; falta service worker |

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
| `signalsmith-stretch` | Pitch shift de qualidade (MIT) | Troca de motor: A/B de ouvido, latência e CPU no tablet | `npm i signalsmith-stretch` | P2 |
| `vite-plugin-pwa` | Service worker e precache offline | Cache errado pode servir versão velha no palco; precisa de estratégia de atualização | `npm i -D vite-plugin-pwa` | P2 |
| `@soundtouchjs/audio-worklet` | Alternativa de pitch shift (MPL-2.0) | Qualidade em música polifônica não verificada | `npm i @soundtouchjs/audio-worklet` | P3, só comparação |
| `security-guidance`, `code-review`, `typescript-lsp` (marketplace oficial) | Lembretes de segurança, revisão de PR, navegação de tipos | Duplicam parte do que já temos | `/plugin install <nome>@claude-plugins-official` | P3 |

Antes de instalar qualquer plugin, ver o custo de contexto na aba Marketplaces do `/plugin`.

## 3. Não adotar

- MCP "Workers Bindings": descontinuado pela Cloudflare em favor de `mcp.cloudflare.com/mcp`.
- `rubberband-wasm` / `rubberband-web`: GPL (licença comercial separada); distribuir o app exigiria cumprir a GPL.
- `essentia.js`: AGPL v3. Detecção de tom fica em algoritmo próprio (cromagrama + perfis de tonalidade) em TypeScript, com teste.
- Segundo store de memória: proibido pelo charter do cérebro.

## 4. Próprios do projeto (criados em `.claude/`)

- `.claude/agents/audio-engine-reviewer.md`: revisa mudanças no motor Web Audio contra os quatro princípios de palco do `AGENTS.md`. Só lê e roda testes.
- `.claude/agents/firebase-rules-reviewer.md`: revisa `firestore.rules`, papéis e convites, e o Worker de stems. Só lê e roda a suíte de regras.
- `.claude/skills/stage-qa/SKILL.md`: roteiro de teste de palco antes de culto ou ensaio, separando o que o teste prova do que só o ouvido confirma.

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
