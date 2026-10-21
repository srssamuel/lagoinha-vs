# Alinhamento e estalos na transposição: medição no áudio renderizado (2026-10-21)

Escopo: motor de áudio (`PitchShifterDspNode`, `AudioRoutingGraph`, `MetronomeScheduler`). Método: o grafo de produção é
empacotado com o esbuild do Vite e renderizado num `OfflineAudioContext` do Chromium (Playwright), sem mocks de
`AudioParam`. Os comandos de tom são aplicados no relógio do contexto (`suspend`/`resume`, granularidade de 128 amostras).
Material: senoide 440 Hz, acorde de 3 senoides, trem de ataques a 120 BPM, ataques a cada 120 ms (transições) e
"stem de violão real (acervo)". "Antes" é o `HEAD` (6c99b70) renderizado com o mesmo script e os mesmos critérios.

## 1. Origem do número 48 ms e compensação que já existia

- 48 ms é `grainWindowSec = 0.048` em `PitchShifterDspNode.ts`: a janela granular, escolhida como compromisso entre definição
  de ataque e graves. Não é medição. O comentário de `setSemitones` ("o wet chega até 48ms atrasado") repete o valor teórico
  máximo: o delay de cada tap varre 0 a 48 ms (`base + profundidade * serra`).
- Medido no render real, o wet atrasa em média cerca de metade disso (o ganho da janela de Hann pesa o meio da varredura):
  centroide de energia do ataque +23,8 ms (+2 st) e +24,6 ms (−2 st) sobre o caminho Pitch Lock; o ataque (20% do pico)
  chega entre +6 e +31 ms. O pior evento isolado foi +30,7 ms, não 48. A observação do revisor (~24 ms médios) está certa.
- Compensação anterior: nenhuma. Busca por `latency`/`compens` em `src/infrastructure/audio` não achou nada; o caminho dry era
  um fio (`dryGain -> output`). O crossfade de 30 ms de 6c99b70 só trocou degrau por rampa; o deslocamento de ~24 ms entre
  o stem transposto e a bateria/click/guia (Pitch Lock) continuava, e aparecia/sumia ao ligar/desligar a transposição.

## 2. Achados (demonstrados por medição) e correções

| # | Achado | Evidência (antes) | Correção | Depois |
|---|---|---|---|---|
| A | Estalo de escala cheia a cada ciclo do LFO (2,3 a 9 Hz), com a transposição ligada, mesmo sem trocar o tom. O `OscillatorNode` `sawtooth` é band-limited e o salto vem com ringing de Gibbs; o LFO é compartilhado e o tap B (janela ~1) lê esse ringing como variação de delay de ms | Salto máximo entre amostras 31 a 48x o do sinal seco em estado estacionário (+2, −2, +6, −6 st); espectrograma com linhas verticais de banda larga | `SawLfo.ts`: dente de serra agendado em `ConstantSourceNode.offset` com salto de uma única amostra e fase contínua ao mudar a frequência | 0,7x a 1,4x (= razão de pitch, o limite natural) |
| B | Comandos sucessivos dentro do crossfade geravam pico de uma amostra e degrau de ganho: `cancelScheduledValues` apaga o fim da rampa em curso e `param.value` devolve o valor do quantum anterior | Picos de 0,13 a 0,17 de amplitude (5 a 7x o normal) em rajadas de 3 e 7 comandos em 20 a 30 ms | `LinearParamTrack.ts`: trajetória modelada em JS, rampa em curso truncada por rampa colinear; agendamento a partir de `agora + 10 ms` (`commandLeadSec`) | Salto 0,85x a 1,01x do seco nas rajadas |
| C | Desalinhamento sistemático stem transposto x Pitch Lock | +23,8/+24,6 ms (centroide); salto de +23,8 ms ao entrar e de −23,8 ms ao sair da transposição | Latência constante `PITCH_PATH_LATENCY_SEC = 21 ms` em todo stem (delay no caminho dry, antes do ganho dry); o click procedural soma a mesma latência em `scheduleClick` (e +6 ms do strip, ver seção 7) | +3,1/+3,2 ms (centroide), −4,2/+0,3 ms (ataque); salto ao entrar/sair +2,9/+2,9 ms |

Observação sobre C: o primeiro desenho (delay depois do ganho dry) deslocava o ganho dry em 21 ms em relação ao wet e
somava dry + wet até 1,7 durante o crossfade (salto de 1,7x no render). Foi pego pela própria medição e corrigido (delay
antes do ganho dry, para os dois ganhos agirem no mesmo instante).

Por que 21 ms e não 24 (metade da janela): equilibra o erro entre as quatro estatísticas (ataque e centroide, +2 e −2 st).
Sem compensação os erros médios eram +15,7 a +24,6 ms. Com 24 ms o centroide fica em ~0 e o ataque adianta 5 a 8 ms; com
21 ms medidos depois: −4,2 a +3,2 ms. A estimativa tem incerteza de cerca de ±2 ms (14 ataques por caminho; a fase inicial
do LFO muda o resultado em 1 a 2 ms entre versões: com os números do `HEAD` o mesmo 21 ms daria −5,3 a +3,6 ms). A folga
até os 5 ms de tolerância na média do ataque a +2 st é de 0,8 ms: o critério é apertado de propósito e vai acusar mudança
futura no desenho do shifter.

Custo da latência constante: todo o playback (stems e click procedural) sai 21 ms mais tarde que antes. O click continua
alinhado com a banda (mesma latência nos dois). Fica 21 ms atrás do que o PA reforça ao vivo (vozes, instrumentos). Ver seção 6.

## 3. Latência medida por caminho

Em ms, relativo à entrada. Inclui ~14,65 ms da cadeia restante (compressores, saturador 2x, limiter do master), comum a
todos os caminhos e inalterada.

| Caminho | Antes: ataque médio [min..máx] | Antes: centroide médio | Depois: ataque médio [min..máx] | Depois: centroide médio |
|---|---|---|---|---|
| Pitch Lock (bateria/loop/click/guia) | 14,65 [14,63..14,67] | 14,69 | 35,65 [35,63..35,67] | 35,69 |
| Harmônico sem transposição (0 st) | 14,65 | 14,69 | 35,65 | 35,69 |
| Harmônico +2 st | 30,33 [20,73..43,04] dp 6,2 | 38,47 | 31,50 [22,73..41,21] dp 5,8 | 38,80 |
| Harmônico −2 st | 33,93 [23,17..45,38] dp 8,0 | 39,29 | 35,93 [22,83..47,17] dp 7,6 | 38,91 |

Relativo ao Pitch Lock, depois: +2 st ataque −4,2 ms (pior evento −12,9 a +5,6), centroide +3,1 ms; −2 st ataque +0,3 ms
(pior evento −12,8 a +11,5), centroide +3,2 ms. Seco x Pitch Lock: 0 amostras de diferença, antes e depois. Pitch Lock
inalterado durante os comandos (variação de ataque ≤ 0,1 ms em 57 ataques).
Durante a transição (ataques a cada 120 ms, 0 > +2 > 0): centroide seco 35,68 ms, transposto 38,57 ms, seco 35,69 ms.
Violão real (correlação cruzada de envoltória, correlação 0,57 a 0,59, estimativa grosseira porque o conteúdo muda com o tom):
+2 st +2,0 ms e −2 st +11,1 ms sobre o seco já atrasado; é uma realização que depende da fase do LFO em cada nota.

Limitação inerente ao desenho (não corrigida, só medida): o ataque do wet varia de 8 a 27 ms entre eventos (+2) e 8 a 33 ms
(−2) conforme a fase do LFO no momento do ataque, e o nível do ataque varia 0,36x a 0,90x. Reduzir isso exigiria outro
algoritmo (preservação de transiente) ou janela menor (qualidade de grave), fora do escopo.

## 4. Tolerância de alinhamento adotada

- Média de ataque e de centroide do caminho transposto em relação ao Pitch Lock: |Δ| ≤ 5 ms.
- Qualquer evento isolado: |Δ| ≤ 15 ms. Seco x Pitch Lock: idêntico. Salto médio ao entrar/sair da transposição ≤ 5 ms.
- Justificativa: a literatura de percepção e execução em conjunto coloca o limiar de ordem temporal entre sons em ~20 ms
  (Hirsh, 1959), a zona de fusão do efeito de precedência em até ~30 a 50 ms para música e cliques (Haas, 1951) e a
  assincronia típica entre músicos "simultâneos" em 30 a 50 ms (Rasch, 1979). Os 15 ms por evento ficam abaixo do menor desses
  valores e os 5 ms médios deixam margem para o jitter do shifter. Valores citados de memória; confirmar nas fontes antes de
  reutilizar fora deste documento. O limiar de 5 ms na média é uma escolha de engenharia, não um número da literatura.
- Limite do que passa: com 21 ms o pior evento (−12,9 / +11,5 ms) usa 86% da folga de 15 ms.

## 5. Resultado por cenário (render real; salto = maior diferença entre amostras vs. referência seca; HF = energia > 8 kHz
na janela; nível = RMS da janela vs. estados estacionários; pico em dBFS no canal FOH; "checks" = falhos antes -> depois)

| Cenário | Material | Salto (x) | HF Δ dB | Nível Δ dB | Pico | Tom final (cents) | Checks |
|---|---|---|---|---|---|---|---|
| 0 > +2 > 0 | senoide | 33,2 -> 1,12 | 30,1 -> 1,5 | -3,0 -> -2,3 | -7,4 | 0 | 2 -> 0 |
| 0 > +2 > 0 | acorde | 24,6 -> 1,04 | 31,7 -> 2,0 | -1,3 -> -1,1 | -6,3 | 0/0/0 (picos) | 2 -> 0 |
| 0 > +2 > 0 | ataques 120 ms | n/a | 0 -> 0 | -3,1 -> -2,8 | -3,9 | n/a | 1 -> 0 |
| 0 > +2 > 0 | violão real | n/a | 25,5 -> 1,9 | -2,2 -> -1,6 | -5,6 | n/a | 0 -> 0 |
| +2 > −2 > +2 | senoide | 11,3 -> 1,00 | 19,2 -> -1,0 | 0,2 -> 0,9 | -7,4 | +8,1 | 3 -> 0 |
| +2 > −2 > +2 | acorde | 12,0 -> 0,94 | 21,8 -> -0,9 | -0,3 -> 0,2 | -6,4 | -10/+10/+2 (picos) | 2 -> 0 |
| +2 > −2 > +2 | ataques 120 ms | n/a | -0,1 -> 0,05 | 0,2 -> 0,3 | -4,6 | n/a | 0 -> 0 |
| +2 > −2 > +2 | violão real | n/a | 9,5 -> -0,9 | -0,1 -> 0,0 | -5,8 | n/a | 0 -> 0 |
| rajada 3 em 20 ms (+2,−2,+2) | senoide | 0,97 -> 1,00 | -1,4 -> -0,7 | -1,6 -> -0,9 | -7,4 | +7,8 | 1 -> 0 |
| rajada 3 em 20 ms (+2,−2,+2) | acorde / ataques / violão | 0,94 -> 0,94 (acorde) | <= 2,4 -> <= 0 | <= 2,3 dB | <= -3,9 | picos -10/+10/+2 | 0 -> 0 |
| rajada 3 em 20 ms (+2,−2,0) | senoide | 10,4 -> 1,01 | 8,1 -> 0,0 | -0,2 -> -0,2 | -7,4 | 0 | 2 -> 0 |
| rajada 3 em 20 ms (+2,−2,0) | acorde / ataques / violão | 1,49 -> 1,00 (acorde) | 4,0 -> -0,1 (violão) | <= 0,3 dB | <= -3,9 | 0/0/0 | 0 -> 0 |
| rajada 7 em 30 ms (+2,+3,−2,−3,+2,0,+2) | senoide | 1,02 -> 1,00 | -1,2 -> -0,8 | -1,6 -> -0,7 | -7,4 | +7,7 | 1 -> 0 |
| rajada 7 em 30 ms (+2,+3,−2,−3,+2,0,+2) | acorde / ataques / violão | 0,80 -> 0,95 (acorde) | <= -0,1 -> <= -0,4 | <= 1,1 dB | <= -4,1 | picos -10/+10/+2 | 0 -> 0 |
| Estacionário +2, −2, +6, −6 st | senoide e acorde | 31 a 48 -> 0,7 a 1,4 | n/a | n/a | n/a | n/a | 8 -> 0 |
| Click + guia, SPLIT_IEM_PA | senoide | n/a | n/a | n/a | R: <= −240 dBFS (nenhuma energia); L: -1,4 | n/a | 0 -> 0 |
| Click + guia, MULTI_4CH_DISCRETE | senoide | n/a | n/a | n/a | ch1/ch2: <= −240; ch3/ch4: -7,9 | n/a | 0 -> 0 |

Os "antes" que passam nas rajadas com acorde ou senoide (0,94 a 1,02x) não provam ausência do defeito A: a janela das
rajadas cobre só ~250 ms e o estalo do LFO é periódico; o defeito A é provado pelas linhas "Estacionário". Total no
`HEAD`: 30 de 133 critérios falham; depois: 0 de 133.

Limitações do shifter, medidas e inalteradas (mesmos valores no `HEAD`): erro de afinação próprio de +7,7 a +8,1 cents
em senoide pura a +2 st e −10/+10/+2 cents nas três notas do acorde (soma de dois taps parcialmente coerentes); buracos de
nível de até −11,6 dB (senoide pura) e −6,9 dB (acorde) em estado estacionário, por cancelamento entre taps. Por isso
o critério de "tom final == último comando" usa ±25 cents mais a comparação do estado interno (`currentSemitones`,
`wetActive`, `pitchUp`), e o de "buraco de nível" compara com o pior estado estacionário em vez de com o sinal seco.

## 6. Verificado automaticamente, escuta realizada, pendente no equipamento

### Verificado automaticamente (render do grafo de produção no Chromium)
- `node scripts/audio-render/render-alignment.mjs --check` (141 critérios, ~90 s; eram 133 antes da seção 7): descontinuidade, HF no instante da
  troca, clipping (pico > 0 dBFS), buracos de nível, estado final == último comando, alinhamento por caminho, vazamento
  de click/guia (SPLIT: R silêncio absoluto; MULTI: ch1/ch2 silêncio, click só em ch3, guia só em ch4).
  `--quick` roda 54 critérios em ~15 a 25 s e é o que o Vitest executa (`AudioAlignmentRender.test.ts`; sem Playwright
  ou com `SKIP_AUDIO_RENDER=1` aparece como skip "PULADO: Playwright ausente" com `console.warn`; com
  `REQUIRE_AUDIO_RENDER=1` a ausência FALHA o teste). No `HEAD`, o mesmo `--quick` falha 21 dos 46 critérios (verificado).
- Testes unitários novos/atualizados com `AudioParam` falso que avalia a linha do tempo: `PitchShifterCrossfade` (inclui a
  rajada de 7 comandos e a latência constante igual em stems transpostos e Pitch Lock), `SawLfoAndTrack` (salto de uma
  amostra, mudança de frequência contínua em fase, retomada de rampa sem degrau, grafo input -> delay -> ganho -> output),
  `MetronomeScheduler` (click soma a latência), `AudioRoutingGraph`/`WebAudioEngineRouting` (click/guia nunca no FOH).
- WAVs, espectrogramas e formas de onda: `%LOCALAPPDATA%\lagoinha-vs\relatorios\audio\{antes-HEAD,depois}\` (fora do git),
  com `resultados.json` e o excerto de 20 s do stem de violão real copiado do acervo (somente leitura).

### Escuta realizada
Nenhuma. Quem escreveu este relatório não escuta áudio: todos os números vêm de análise do sinal renderizado. Espectrogramas
conferidos visualmente (linhas verticais de banda larga no `HEAD`, ausentes depois), o que não substitui ouvir.

### Pendente no equipamento de palco (tablet + interface USB), só o Samuel valida
- Escuta em tablet + interface real: troca de tom em música com violão e teclado, com bateria e click tocando, e rajada de
  toques no seletor de tom. O render offline não prova o thread de áudio em tempo real (`commandLeadSec` = 10 ms é uma
  hipótese de antecedência segura; confirmar sem estalo com carga de CPU).
- Latência total medida com loopback na interface (a medição aqui é relativa e inclui a cadeia restante; não inclui
  o hardware). Conferir se +21 ms em todo o playback incomoda o retorno do baterista/IEM e o casamento com instrumentos
  ao vivo no PA (vozes sem VS saem 21 ms antes do playback).
- Vazamento medido no PA com click/guia ligados em SPLIT_IEM_PA e MULTI_4CH_DISCRETE (o render prova o grafo, não o cabo
  nem a mesa) e desconexão física do cabo (ENG-02).
- Sessão longa (2 h+): o `SawLfo` agenda 30 s de ciclos por stem e renova a cada 5 s (e a cada toque de tom, `ensureHorizon`); conferir CPU/memória no tablet e
  que não há estalo na renovação. Suporte a `createConstantSource` no navegador do tablet (Safari/iOS mais antigo).
- Contagem prévia e pulo de seção quantizado com o click procedural +21 ms: conferir de ouvido que o click e a banda entram
  juntos (testado por unidade e por render, não em palco).

## 7. Correções da revisão independente (itens 1 a 5)

Todos medidos/testados; o que depende de hardware continua na seção 6.

| # | Problema | Correção | Prova |
|---|---|---|---|
| 1 | **Vazamento de click (crítico).** O click procedural é agendado até ~150 ms + 21 ms antes e o destino é escolhido no agendamento: Stereo -> Split com música tocando soltava o click já agendado no PA (R); pause/stop/seek não cancelavam os pendentes | `MetronomeScheduler` guarda `{source, gain, at, end}` dos clicks até terminarem. `cancelPending()` (stop()+disconnect()) é chamado por `stop()` e `cancelCountIn()` (portanto por pause, stop, seek e fim da contagem); `rerouteScheduled()` religa os pendentes ao destino do modo novo e `WebAudioEngine.setRoutingMode` o chama. Escolhi religar (e não um nó persistente por modo) porque reaproveita `connectClickToBus`, a única fonte da regra de destino, e não cria nó novo entre stem e merger | Unidade: `MetronomeScheduler.test` (religar em 4 pares de modos, controle que enxerga o vazamento, stop/cancelCountIn/cancelPending), `WebAudioEngineRouting.test` (Stereo -> Split: só entrada 0; Stereo -> 4CH: só 2; pause/stop/seek/contagem param e desconectam). `FakeNode.disconnect(dest?)` agora remove arestas de verdade. Render real: Stereo -> Split em 2,46 s com click de 2,55 s já agendado: R depois da troca **-240 dBFS**; sem religar (controle) R = **+0,2 dBFS**; stop() com click agendado: **-240 dBFS** (controle sem parar: som presente) |
| 2 | `SawLfo` reagendava 180 s de ciclos por stem a cada toque | Horizonte 30 s, renovação a cada 5 s (opções `horizonSec`/`refillMs`), fase contínua (continua do último salto agendado), `ensureHorizon()` chamado por `PitchShifterDspNode.setSemitones` | Chamadas de AudioParam do LFO por toque (+2 st, 6 stems): **5532 (180 s) -> 936 (30 s)**, -83%. Teste com relógio falso até 200 s: valor == 2*fase-1 em todo ponto amostrado, sem buraco (e controle sem renovação congela em -1). `dispose` limpa o timer |
| 3 | Todo `start(0, offset)` no forEach: cada stem partia num instante diferente | `playbackStartTime = ctx.currentTime + TRANSPORT_START_MARGIN_S (50 ms) - pausedAtTime` em play, fim da contagem e seek; `when = playbackStartTime + offset` calculado uma vez e passado a todos os `start()`; stems decodificados tarde partem em `max(agora, when)` com a posição correspondente (e não partem durante a contagem); `getCurrentPlaybackTime` com piso 0; o metrônomo usa `getTransportLeadSec` | `WebAudioEngineRouting.test`: todos os start() de play, retomada e seek recebem o mesmo `when` e a posição certa |
| 4 | `dispose` do `SawLfo`/`PitchShifterDspNode` com stop()/disconnect() no mesmo try; segunda inversão <30 ms que volta ao sentido em vigor deixava o wet descendo a 0 (dry puro) | try separados; o retorno ao sentido em vigor refaz dry -> 0 e wet -> 1 a partir do ponto atual | Rajada +2,-2,+2: wet mínimo **> 0,3** (0,5 pelo modelo; era 0). Render real: cenário `rajada 3 em 20 ms (+2,-2,+2)` segue sem degrau |
| 5 | `AudioAlignmentRender` passava sem Playwright | skip explícito "PULADO: Playwright ausente" + `console.warn`; `REQUIRE_AUDIO_RENDER=1` falha | Executado nos três modos |

### Efeito da margem de 50 ms no click procedural (render real, 14 tempos, `MetronomeScheduler` de produção)
- Referência: stem de bateria com ataques a cada 500 ms iniciado no `when` comum, pelo `PitchShifterDspNode`; o click
  procedural é agendado pelo `start()` com `getTransportLeadSec` = 50 ms. Diferença click - stem: **-0,02 ms** em todos
  os 14 tempos (desvio 0). Controle sem tratar a margem (host sem `getTransportLeadSec`): **-50,02 ms**; o critério enxerga.
- Achado extra, medido: antes de somar `CLICK_STRIP_LATENCY_SEC` o click saía **-6,02 ms** antes do stem. O channel strip do
  stem tem um `DynamicsCompressorNode` (6 ms de pre-delay no Chromium, mesmo com ratio 1) que o click procedural não
  atravessa. Corrigido com `CLICK_STRIP_LATENCY_SEC = 0.006` em `scheduleClick` (constante específica do Chromium; se o
  tablet usar outro motor, medir de novo).
- Efeito colateral da margem: a música (e o click) começam 50 ms depois do toque em Play; `getState().currentTime` fica em
  0 até a partida e o tempo quantizado em 100 ms muda 50 ms depois (teste ajustado de 0,15 s para 0,17 s de relógio).

## 8. Reproduzir

```
node scripts/audio-render/render-alignment.mjs --tag depois --check   # matriz completa, imagens (ffmpeg)
node scripts/audio-render/render-alignment.mjs --quick --check        # o que o Vitest roda
```
Requer Playwright global (`npm root -g`) com Chromium e ffmpeg no PATH (imagens). O excerto de violão real é opcional
(`violao_real_20s.wav` na pasta de saída); sem ele o cenário é pulado.
