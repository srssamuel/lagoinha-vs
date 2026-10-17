# Lagoinha VS — Operating Charter

## Overview
- **Nome:** Lagoinha VS (Virtual Session & Multitracks Player)
- **Propósito:** Sistema de reprodução de multitracks ("VS"), metrônomo inteligente (Click), guia vocal (Cues), navegação quantizada por seções e pad contínuo para o ministério de louvor da Igreja Batista Lagoinha João Pessoa.
- **Ambiente:** Palco ao vivo (notebook ou tablet conectado à mesa de som / interface de áudio USB).

## Arquitetura & Stack
- **Arquitetura:** Clean Architecture (`src/domain`, `src/application`, `src/infrastructure`, `src/presentation`).
- **Framework:** React 19 + TypeScript (strict mode) + Vite.
- **Motor de Áudio:** Web Audio API com matriz de roteamento via `ChannelSplitterNode` e `ChannelMergerNode` para isolamento de canais:
  - **Canal L (In-Ear Monitors):** Click (Metrônomo) + Guia de Voz + Áudio da Banda.
  - **Canal R (FOH / PA):** Apenas instrumentos e voz secundária (sem click nem guia).
- **Estilização:** Tailwind CSS (Dark Stage Theme de alto contraste para visibilidade no púlpito escuro).
- **Ícones:** Lucide React.
- **Testes:** Vitest para testes unitários de domínio e aplicação.

## Comandos de Execução e Verificação
- Instalar dependências: `npm install`
- Rodar em desenvolvimento: `npm run dev`
- Executar testes unitários: `npm test`
- Verificar tipos (TypeScript): `npm run typecheck`
- Gerar build de produção: `npm run build`

## Princípios de Palco & Segurança de Áudio
1. **Zero Vazamento de Click:** O Click/Metrônomo e a Guia jamais devem vazar para o auditório. No modo Split, o ganho de roteamento para a saída R (FOH) é forçado a 0.
2. **Sincronismo Sample-Accurate:** Todos os stems compartilham a mesma referência temporal do `AudioContext.currentTime`.
3. **Pulos Quantizados:** Ao acionar refrão ou ponte espontaneamente, a transição respeita o compasso atual para não descompassar a banda.
4. **Pad Contínuo Sem Cortes:** Ao finalizar a música, o gerador de Pad faz crossfade suave, garantindo atmosfera espiritual durante orações e transições.
