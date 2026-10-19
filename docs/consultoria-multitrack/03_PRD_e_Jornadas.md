# 03 — Especificação de Requisitos (PRD) e Jornadas de Usuário
## Do Planejamento em Casa à Ministração no Altar

**Data:** 19/10/2026  
**Documento:** PRD v1.0 — Módulo de Palco e Ensaio  
**Público-Alvo:** Equipes de Desenvolvimento, Designers UX e Líderes de Louvor  

---

## 1. Visão do Produto e Princípios de Design

O sistema foi desenhado sob três mandamentos inegociáveis:
1. **O Altar não Tolera Falhas:** Durante o culto, nenhuma ação destrutiva (apagar música, alterar roteamento de placa, trocar de conta) pode estar acessível com um clique acidental.
2. **Autoridade Musical Compartilhada:** O Ministro de Louvor conduz o fluxo espiritual da adoração; o Operador de Áudio assegura a execução técnica estável. O software deve servir à dinâmica litúrgica, sem engessar a liberdade nem criar relógios conflitantes.
3. **Ergonomia Sob Pressão:** Interfaces de palco precisam ser legíveis a 2 metros de distância, com contraste elevado (Dark Theme para ambientes escuros de cabine/palco) e feedback tátil/visual imediato.

---

## 2. A Jornada Completa em 5 Etapas

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 1. PREPARAR │ ──> │ 2. ENSAIAR  │ ──> │ 3. VALIDAR  │ ──> │4. MINISTRAR │ ──> │ 5. MELHORAR │
│   (Em Casa) │     │  (No Estúdio│     │ (Pré-Culto) │     │ (No Altar)  │     │ (Pós-Culto) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Etapa 1: PREPARAR (Líder de Louvor / Editor)
* **Ambiente:** Computador de casa, notebook ou tablet.
* **Ações:**
  * Criar o Setlist do culto (ex: "Culto de Celebração — 24/10").
  * Escolher as músicas do acervo e definir a ordem litúrgica.
  * Definir o **Tom Oficial** adequado ao solista escalado (ex: passar de B para G).
  * Checar o **Mapa de Seções** (Intro, Verso, Refrão, Ponte, Tag) e o BPM.
  * Ajustar a **Cifra Pro®**, confirmando que os acordes transpostos batem com a harmonia.
  * Salvar e publicar a **Versão Aprovada do Culto** na nuvem com identificação de quem assinou e data/hora.

### Etapa 2: ENSAIAR (Músicos e Banda)
* **Ambiente:** Em casa ou no ensaio geral de sábado na igreja.
* **Ações:**
  * O músico entra na plataforma com seu login e visualiza o setlist oficial do próximo culto.
  * Modo **Estudo / Mix Pessoal**: o guitarrista pode solar a pista de guitarras para tirar o arranjo, ou mutar a guitarra para tocar junto com a base.
  * As cifras são exibidas no tom oficial exato aprovado pelo líder, eliminando divergências de notas no ensaio.

### Etapa 3: VALIDAR (Técnico de Som / Pré-Culto)
* **Ambiente:** Computador da igreja conectado à mesa de som (FOH) e ao sistema de in-ear (IEM), 45 minutos antes do início do culto.
* **Ações:**
  * O técnico abre o sistema: os arquivos de áudio já estão no cache local do computador (IndexedDB).
  * Abre o modal de **Roteamento de Áudio de Palco**:
    * Confere se a interface física USB está identificada no seletor com **4 Canais Ativos (Badge Verde)**.
    * Executa o protocolo de **Teste de Tom Line-Level**:
      * Clica em *Testar Saída 1 (FOH L)* -> confirma sinal puro de 440 Hz na mesa principal.
      * Clica em *Testar Saída 2 (FOH R)* -> confirma sinal de 554 Hz na mesa principal.
      * Clica em *Testar Saída 3 (Click)* -> confirma sinal de 1.000 Hz **apenas nos fones da banda** e **zero no PA**.
      * Clica em *Testar Saída 4 (Guia)* -> confirma sinal de 880 Hz **apenas nos fones da banda** e **zero no PA**.
  * Sistema armado e aprovado com 100% de confiança para o culto.

### Etapa 4: MINISTRAR (Operação de Altar)
* **Ambiente:** Durante o culto ao vivo.
* **Ações:**
  * **Modo Palco Ativado:** faders de volume de canais individuais ficam bloqueados contra cliques acidentais; a tela exibe a timeline de seções em tamanho grande, BPM, compasso e o botão gigante de **PLAY/STOP**.
  * **Salto Quantizado:** se o ministro decide pular direto para o Refrão, o operador clica no botão "Refrão"; o sistema exibe badge "Próximo: Refrão" e aguarda o final do compasso atual para saltar perfeitamente no tempo.
  * **Repetição de Seção (Loop):** o líder repete a ministração; o operador clica em "Repetir Seção"; a música continua em loop perfeitamente sincronizado.
  * **Modo Liberdade (Espontâneo):** ao entrar no momento de oração espontânea, o operador ativa "Liberdade". Os instrumentos de base fazem um fade suave no tempo forte do compasso, enquanto o **Metrônomo (Click)** e o **Pad Ambiente Contínuo** continuam soando na tonalidade da música.

### Etapa 5: MELHORAR (Revisão Pós-Culto)
* **Ambiente:** Segunda-feira de alinhamento técnico/musical.
* **Ações:**
  * Relatório de culto com histórico de transições executadas, incidentes registrados (se houve queda de dispositivo USB) e notas de volume de stems para o próximo ensaio.

---

## 3. Especificação Detalhada do Modo Palco (Stage Mode)

### Requisitos Funcionais de Interface:
1. **Layout Travado:** Os botões de exclusão de música, importação de arquivos e configurações de conta ficam ocultos ou exigem confirmação dupla com tecla `Shift`.
2. **Visualização de Alta Prioridade:**
   * Nome da Música e Solista em destaque (Fonte mínima: 24px).
   * Tom Atual e BPM com alto contraste (ex: Amarelo Âmbar / Verde Esmeralda).
   * Indicador visual do tempo do compasso (Beat Counter: 1 - 2 - 3 - 4 em tempo real com pulso visual).
   * Barra de progresso da música e tempo restante.
3. **Controles Físicos e Remotos:**
   * Suporte total a teclas de atalho: `Espaço` (Play/Pause), `N` (Next Song), `P` (Prev Song), `L` (Toggle Loop), `Esc` (Pânico/Stop).
   * Mapeamento MIDI via Web MIDI para pedaleiras USB de pé (AirTurn / Behringer FCB1010).

---

## 4. Especificação Detalhada do Modo Liberdade (Spontaneous Freedom)

O *Modo Liberdade* atende à necessidade clássica de cultos pentecostais e contemporâneos de louvor congregacional:

```
[Música Tocando com 13 Stems] ──> [Comando "LIBERDADE" Disparado]
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
     [Final do Compasso Musical Atual]                [Opção de Pad/Click Ativo]
                      │                                               │
                      ▼                                               ▼
    [Fade-Out de 500ms nos Stems VS]                 [Click e Pad Sustentados no Tom]
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                                   [ESTADO: MODO LIBERDADE]
                            (Banda ministra espontaneamente)
                                              │
                                              ▼
                         [Retomada: Operador Clica em "REFRÃO"]
                                              │
                                              ▼
                             [Voz Guia: "Refrão em 1, 2, 3, 4"]
                                              │
                                              ▼
                             [Stems Retomam Perfeitamente no Beat 1]
```

### Regras do Modo Liberdade:
1. **Não corta abruptamente:** Nunca interrompe no meio da frase musical; o desvanecimento ocorre rigorosamente na cabeça do próximo compasso.
2. **Click e Pad Customizáveis:** O operador pode escolher nas preferências:
   * *Apenas Pad Contínuo* (para orações calmas e fundo pastoral).
   * *Pad + Metrônomo* (para orações rítmicas com a banda continuando a tocar no mesmo andamento).
   * *Silêncio Total* (respeitando momentos litúrgicos de silêncio intencional).
3. **Retomada Guiada:** Ao selecionar a seção de retorno, a voz guia sintetizada dispara a contagem prévia de 1 compasso ("1, 2, 3, 4") para que toda a banda entre uníssona no tempo forte.

---

## 5. Matriz de Cenários de Contingência no Altar

| Cenário de Emergência | Comportamento do Sistema | Ação Operacional Exigida |
| :--- | :--- | :--- |
| **O Tecladista faltou ao culto** | O operador clica no preset de formação *"Sem Tecladista"*; o sistema ativa automaticamente as pistas gravadas de Piano, Rhodes e Synths que normalmente ficariam mutadas. | Nenhuma intervenção complexa; arranjo compensado em 1 clique. |
| **O Solista pede para mudar o tom na hora** | O operador clica em `+1` ou `-1` semitons no cabeçalho; o motor aplica o pitch shift imediatamente nos harmônicos; bateria, loops e click permanecem inalterados. | O líder recebe o tom transposto e a cifra na tela se ajusta em tempo real. |
| **Cabo USB da Interface é chutado/desconectado** | O motor de áudio detecta a desconexão do dispositivo (`ondevicechange`); **pausa o áudio imediatamente** e exibe modal vermelho de emergência. **PROIBIDO** jogar o áudio no alto-falante do notebook para evitar que o click vaze no microfone do altar. | O técnico reconecta o cabo USB e clica em "Reconectar e Continuar". |
| **A Internet da igreja cai no meio da ministração** | Zero impacto. Todas as tracks daquele culto já estão carregadas e decodificadas no banco local IndexedDB. | Nenhuma ação necessária; o culto prossegue sem sequer perceber a oscilação de rede. |
| **O Ministro de Louvor decide fazer um silêncio absoluto** | O operador clica no botão **PÂNICO (Fade 100ms)**; todos os sons (stems, click e pad) são desativados suavemente sem estalo no PA. | O culto entra em silêncio litúrgico reverente. |

---

## 6. Escopo da Primeira Versão Comercial (MVP / Gate 1)

### O que ENTRA no MVP:
* Motor Web Audio estéreo e discreto 4CH (`setSinkId`).
* Trava de afinação inteligente (Pitch Lock).
* Extrator binário de ZIP multitrack em memória.
* Timeline de seções com salto quantizado e repetição de loop.
* Cifra Pro® com transposição enarmônica automática.
* Metrônomo procedural e Pad ambiente contínuo com transição suave.
* Modo Palco travado com atalhos de teclado e suporte MIDI básico.
* Armazenamento local persistente em IndexedDB.
* Autenticação de usuários com papéis de Admin e Operador.

### O que FICA PARA FASES POSTERIORES (G2 e G3):
* Catálogo de multitracks comerciais embutido (depende de contratos de gravadoras).
* DAW completa de gravação/edição de áudio multipista (escopo desnecessário para playback de palco).
* Aplicativo mobile nativo para iPhone/Android com monitoração Wi-Fi pessoal (substituível no momento por fones cabeados ou sistemas de rádio existentes na igreja).
* Automação de iluminação DMX e vídeo ProPresenter via OSC/MIDI avançado.
