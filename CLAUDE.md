# Claude Code — __PROJECT_NAME__

@AGENTS.md

## Especifico do Claude Code (nao duplicar o charter aqui)

- Charter do cerebro: `C:\Projetos IA\AGENTS.md` (Maestro v3). Este projeto herda o DESIGN GATE, Zero-Blocker e "evidencia > narrativa".
- Hooks Maestro v3 rodam em qualquer pasta (registrados em `~/.claude/settings.json`): rota do pedido (`router.mjs`) injetada no contexto e gravada em `%LOCALAPPDATA%\maestro\route-latest-claude.md`, guard de comandos destrutivos e de supply-chain, stop gate de evidencia.
- Subagentes globais (`~/.claude/agents`): `principal-architect`, `art-director`, `elite-design-engineer`, `visual-qa-auditor`, `design-reviewer`, `qa-reliability`, `security-guardian`, `debugger`, `researcher`, `council-evaluator`.
- Design (ADR-006): UI/landing/deck seguem o pipeline `elite-design-system` (art-director -> elite-design-engineer -> design-critic SHIP); ferramentas em `C:\Projetos IA\AI-Workstation\scripts\design\`.
- Skills canonicas em `~/.claude/skills`; protocolo por turno: skill `maestro`. `ai sync` / `ai maestro doctor` para manutencao.
- Windows 11 nativo, PowerShell 5.1; Python real em `~\.local\bin\python.cmd` (uv 3.12).

## Grafo de codigo (codebase-memory-mcp 0.12.1, escopo deste repo)

- MCP `codebase-memory` em `.mcp.json` (perfil `analysis`: so leitura; `CBM_ALLOWED_ROOT` = esta pasta). Na primeira sessao o Claude Code pede para aprovar o servidor do projeto.
- Indice: so `src/` e `tests/` (`.cbmignore`). Reindexar depois de mudanca grande:
  `node "C:/Projetos IA/AI-Workstation/scripts/maestro-toolkit.mjs" codebase --scope . cli index_repository --repo-path "C:/Projetos IA/02_PROJETOS_ATIVOS/lagoinha-vs"`
- Use `trace_path` / `get_architecture` / `search_graph` antes de varrer arquivos com Grep. Limite medido: chamada via interface (`AudioEnginePort`) nao aparece como chamador (ex.: `App.tsx:653 -> setRoutingMode`); confirme chamadores com Grep.
- Instalador global (`codebase-memory-mcp install`) NAO e usado: ele grava agentes, hooks e MCP globais geridos pelo Maestro (`ai sync`).

## Projeto

- Proposito: (preencher)
- Stack: (preencher)
- Rodar / testar: (preencher com comandos reais que podem falhar)
