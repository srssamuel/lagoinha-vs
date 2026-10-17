# Claude Code — __PROJECT_NAME__

@AGENTS.md

## Especifico do Claude Code (nao duplicar o charter aqui)

- Charter do cerebro: `C:\Projetos IA\AGENTS.md` (Maestro v3). Este projeto herda o DESIGN GATE, Zero-Blocker e "evidencia > narrativa".
- Hooks Maestro v3 rodam em qualquer pasta (registrados em `~/.claude/settings.json`): rota do pedido (`router.mjs`) injetada no contexto e gravada em `%LOCALAPPDATA%\maestro\route-latest-claude.md`, guard de comandos destrutivos e de supply-chain, stop gate de evidencia.
- Subagentes globais (`~/.claude/agents`): `principal-architect`, `art-director`, `elite-design-engineer`, `visual-qa-auditor`, `design-reviewer`, `qa-reliability`, `security-guardian`, `debugger`, `researcher`, `council-evaluator`.
- Design (ADR-006): UI/landing/deck seguem o pipeline `elite-design-system` (art-director -> elite-design-engineer -> design-critic SHIP); ferramentas em `C:\Projetos IA\AI-Workstation\scripts\design\`.
- Skills canonicas em `~/.claude/skills`; protocolo por turno: skill `maestro`. `ai sync` / `ai maestro doctor` para manutencao.
- Windows 11 nativo, PowerShell 5.1; Python real em `~\.local\bin\python.cmd` (uv 3.12).

## Projeto

- Proposito: (preencher)
- Stack: (preencher)
- Rodar / testar: (preencher com comandos reais que podem falhar)
