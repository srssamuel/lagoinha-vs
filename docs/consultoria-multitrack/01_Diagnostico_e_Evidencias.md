# 01 — Diagnóstico da Base Existente e Matriz de Evidências (Revisão Calibrada)
## Auditoria Técnica, Metrológica e Operacional do Projeto Lagoinha VS

**Data:** 19/10/2026 (Atualizado no Ciclo de Confiabilidade Operacional)  
**Revisão do Repositório:** `fe7586b` (Branch `feat/gate1-reliability`)  
**URL de Produção:** [https://lagoinha-vs-jp.web.app](https://lagoinha-vs-jp.web.app) (Identificação Provisória Interna)  
**Ambiente Auditado:** Windows 11 Pro 64-bit, Node.js v24.19.0, Vite 6.1.0, Vitest 3.0.5, Web Audio API / Chromium headless  
**Avaliador:** Conselho Multidisciplinar de Engenharia de Áudio, Produto e Software  

---

## 1. Sumário Executivo da Auditoria e Correção de Premissas

O projeto **Lagoinha VS** possui uma base de código estruturada sob princípios de **Clean Architecture** (separação estrita entre Domain, Application, Infrastructure e Presentation). Contudo, a transição para uma versão candidata à validação de palco exige calibrar 7 premissas técnicas e operacionais:

1. **Persistência de Armazenamento (`navigator.storage.persist()`):** A API do navegador apenas *solicita* persistência; seu retorno é uma Promise com resultado booleano (`true` ou `false`). A concessão depende de critérios heurísticos do navegador (ex: bookmark, permissões concedidas, engajamento). O software deve tratar expressamente os quatro estados: concedida, recusada, indisponível no ambiente ou erro, distinguindo *conteúdo preparado* de *persistência concedida*.
2. **Notificação de Dispositivos (`devicechange`):** O evento `devicechange` do `navigator.mediaDevices` avisa que o catálogo de dispositivos do sistema mudou. Ele **não oferece garantia temporal em nível de microssegundos** de interrupção física antes que o subsistema do sistema operacional realize fallback. A proteção de software deve reavaliar o endpoint ativo, filtrar eventos espúrios com debounce, interromper a reprodução se a rota necessária for perdida e exigir ação e confirmação explícita do operador para retomar.
3. **Taxonomia Musical de "Loops":** A presença da palavra "loop" no nome de um arquivo não determina se o áudio deve ou não ser transposto. Loops de teclado, sintetizador, violão ou cordas possuem conteúdo harmônico e **devem acompanhar a transposição tonal** do arranjo. Loops percussivos (shakers, pandeiros, congas) são estritamente rítmicos e não devem transpor. O sistema deve separar material harmônico de material percussivo e permitir override explícito por stem na interface e na persistência.
4. **Homologação Multicanal Específica:** Compatibilidade multicanal de áudio não pode ser anunciada genericamente; ela exige discriminar o modelo de hardware (ex: Behringer UMC404HD USB 2.0), sistema operacional (Windows 11 Build 22631), driver (ASIO/WDM v5.57.0), navegador (Chrome 130+ 64-bit) e configuração do painel de som do Windows (`mmsys.cpl` Quadrafônico).
5. **Cálculo de PCM Rigoroso:** O dimensionamento de memória na RAM deve explicitar os parâmetros completos: duração exata em segundos, quantidade de canais físicos por stem (mono vs estéreo), taxa de amostragem (44.1 kHz ou 48 kHz) e representação numérica das amostras (`Float32Array`, 4 bytes por amostra por canal).
6. **Hierarquia de Evidências (Unitários vs Audição vs Bancada):**
   * *Testes unitários automatizados:* comprovam a correção lógica, matemática de ganhos e máquinas de estado em software.
   * *Avaliação auditiva crítica:* necessária para avaliar artefatos de fase, transientes e inteligibilidade na transposição tonal.
   * *Medições físicas em bancada com hardware real:* necessárias para comprovar ruído de piso, crosstalk entre saídas físicas, imunidade a dropouts e ausência de vazamento de click no LR da mesa de som.
7. **Titularidade, Direitos e Sustentabilidade Comercial:** O uso comercial de stems de terceiros (MultiTracks/Loop Community) é juridicamente restrito às permissões do comprador para uso congregacional local; a nuvem deve operar como backup privado por congregação (BYOC). O valor de R$ 129/mês permanece como uma **hipótese de negócio em validação** durante os testes piloto, dependente de custos reais de suporte e infraestrutura.

---

## 2. Matriz de Diagnóstico e Evidências Atualizada

| Capacidade | Implementação no Código | Evidência Analisada | Limitação Real & Premissa Calibrada | Impacto | Prioridade | Recomendação |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Suíte de Testes (62 Testes)** | 16 arquivos em `tests/unit/` | Execução Vitest v3.2.7 (62 aprovados em ~1.2s) | Testam nós matemáticos e lógica isolada; não substituem ensaio contínuo de 8h em bancada física. | Médio | **P1** | Preservar a suíte unitária e acrescentar testes de regressão para desconexão USB, persistência e política tonal de loops. |
| **Roteamento 4CH Discreto** | `AudioRouting.ts`, `WebAudioEngine.ts` (`ChannelMergerNode(4)`) | Testes de matriz de ganhos e tom senoidal isolado | No Windows WASAPI, endpoints virtuais precisam de ajuste manual em `mmsys.cpl`. Interfaces USB dependem de driver WDM multicanal. | Crítico | **P0** | Homologar lista fechada de interfaces físicas e manter tons de calibração line-level. |
| **Proteção contra Perda de Saída (`devicechange`)** | `WebAudioEngine.ts` | Chamada a `setSinkId` | `devicechange` não garante corte físico antes do SO tentar fallback. | Crítico | **P0** | Implementar `setupDeviceChangeListener` com debounce, pausa imediata e trava de revalidação pelo operador. |
| **Persistência Offline (`IndexedDB`)** | `IndexedDbStorageService.ts` | Salva JSON de músicas e setlists | Blobs de áudio locais não eram armazenados permanentemente no IndexedDB; `persist()` não era verificado. | Crítico | **P0** | Adicionar store `audio_blobs`, tratar retorno de `navigator.storage.persist()` e verificar integridade offline antes do culto. |
| **Política Tonal de Loops (Pitch Lock)** | `TrackStem.ts`, `PitchShifterDspNode.ts` | Regex em nomes de arquivos travava todo "loop" | Loops harmônicos (ex: "Keys Loop") ficavam desafinados ao transpor a música. | Crítico | **P0** | Implementar `PitchPolicy` (`harmonic`, `percussive`, `locked`), classificar por conteúdo musical e permitir override manual. |
| **Controle de Acesso e Multi-Tenancy** | `FirebaseAuthService.ts`, `User.ts` | Autenticação local e mock de usuários | Falta aplicação de regras rígidas de segurança por tenant (`churchId`) no Firestore/Storage e prevenção de auto-elevação de papel. | Alto | **P0** | Criar `firestore.rules` e `storage.rules`, enriquecer `User` com `churchId` e blindar promoção de roles. |
| **Gerenciamento de Memória PCM** | `WebAudioEngine.ts` (decodificação lazy) | Limpeza de nós em `loadSong` | Decodificar todos os stems estéreo simultaneamente consome ~1,5 GB por faixa. | Alto | **P1** | Manter decodificação just-in-time e converter stems centrais (click/guia/baixo) para buffers mono. |

---

## 3. Orçamento de Memória PCM Detalhado

Para eliminar ambiguidades no dimensionamento de hardware, o consumo de memória RAM do áudio descompactado é calculado formalmente por:

$$\text{Bytes por Stem} = \text{Duração (s)} \times \text{Sample Rate (Hz)} \times \text{Canais} \times \text{Bytes por Sample}$$

### Cenário de Referência (Música Típica de Louvor Congregacional):
* Duração: **300 segundos (5 minutos)**
* Taxa de Amostragem: **48.000 Hz** (padrão profissional de vídeo e áudio ao vivo)
* Representação: **32-bit Float IEEE (`Float32Array`, 4 bytes por amostra)**
* Stems Estéreo (2 canais): Teclados, Guitarras, Pads, Backing Vocals, FX (8 stems)
* Stems Mono (1 canal): Click, Guia, Contrabaixo, Bumbo, Caixa (5 stems)

$$\text{Stems Estéreo} = 8 \times 300 \times 48.000 \times 2 \times 4 = 921.600.000 \text{ bytes} \approx 921,6 \text{ MB}$$
$$\text{Stems Mono} = 5 \times 300 \times 48.000 \times 1 \times 4 = 288.000.000 \text{ bytes} \approx 288,0 \text{ MB}$$
$$\textbf{Consumo Total de PCM por Música} = 921,6 \text{ MB} + 288,0 \text{ MB} = \mathbf{1.209,6 \text{ MB} (\approx 1,21 \text{ GB})}$$

**Conclusão Metrológica:** Manter apenas a música atual carregada em RAM (com pré-carregamento assíncrono da próxima faixa sem decodificação antecipada de todos os buffers) garante que o processo do navegador opere confortavelmente na faixa de **1,4 GB a 1,8 GB de RAM total**, viável em computadores com 8 GB de memória.
