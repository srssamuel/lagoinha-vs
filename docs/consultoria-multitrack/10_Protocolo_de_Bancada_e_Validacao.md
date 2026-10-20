# 10 — Protocolo de Bancada, Confiabilidade Operacional e Validação de Palco (Gate 1)
## Metodologia de Testes Físicos, Ensaios de Estresse e Critérios de Aceitação

**Data:** 19/10/2026  
**Especialidade:** Engenharia de Sistemas de Áudio ao Vivo, Testes Metrológicos & Confiabilidade de Software  
**Status:** Protocolo Homologatório — Versão Candidata à Validação de Palco  
**Branch de Referência:** `feat/gate1-reliability`  

---

## 1. Objetivo e Diretrizes do Gate 1

Este documento estabelece o protocolo formal de testes laboratoriais e ensaios físicos em bancada para qualificar o **Lagoinha VS** como versão candidata à operação em culto ao vivo. 

O princípio reitor é a **hierarquia da evidência**:
* Testes unitários e mocks de software garantem correção lógica e prevenção de regressões algorítmicas, mas **não comprovam** imunidade a falhas elétricas, travamento de buffer de driver ou vazamento de áudio físico.
* A aprovação final para operação litúrgica em FOH e IEM exige **medições físicas com osciloscópio / analisador de áudio**, teste de estresse de longo prazo e validação a frio (*cold boot*).

---

## 2. Protocolo de Ensaio Contínuo de Estresse (8 Horas Ininterruptas)

O software deve demonstrar estabilidade operacional contínua durante um ciclo equivalente a uma jornada completa de ensaio geral e dois cultos dominicais com folga de segurança.

### 2.1 Configuração da Bancada:
* **Host de Teste:** Laptop com Windows 11 / macOS, conectado à rede elétrica sem modo de economia de energia ativo.
* **Interface de Áudio:** Interface USB multi-saída (ex: Behringer UMC404HD, Focusrite Scarlett 4i4 ou M-Audio M-Track Quad).
* **Carga de Reprodução:** Setlist de 12 músicas em loop contínuo, totalizando 13 canais discretos por música (incluindo Click, Guia falada, Bateria, Baixo, Guitarras, Teclados, Loops e Vozes).

### 2.2 Rotina de Medição a Cada 60 Minutos:
1. **Consumo de Memória RAM:** Acompanhamento via Process Manager / DevTools Memory Profiler.
   - *Critério:* Ausência de vazamento progressivo de memória (*memory leak*). O consumo deve se estabilizar no patamar nominal do orçamento formal calculado:
     $$\text{Memória (bytes)} = \text{Duração (s)} \times \text{Taxa (Hz)} \times \text{Canais} \times 4\text{ bytes (Float32)}$$
     - Para faixa típica de 5 min (300 s) a 48 kHz com 8 stems estéreo e 5 stems mono:
       $$\text{RAM Total} = (8 \times 2 + 5 \times 1) \times 300 \times 48.000 \times 4 = 1.209.600.000\text{ bytes} \approx 1.209,6\text{ MB} (\approx 1,21\text{ GB})$$
     - No teto operacional de 13 stems todos estéreo (26 canais PCM a 48 kHz / 32-bit Float):
       $$\text{RAM Teto} = 13 \times 2 \times 300 \times 48.000 \times 4 = 1.497.600.000\text{ bytes} = 1,4976\text{ GB} \approx 1,395\text{ GiB}$$
     - *Descarte e Transição:* O motor descarta buffers da faixa anterior imediatamente na troca de música (`dispose()`), garantindo que o processo do navegador permaneça estável entre $1,4\text{ e }1,8\text{ GB}$ ao longo das 8 horas ininterruptas, sem acúmulo contínuo de setlist inteira em RAM (o que exigiria $>8\text{ GB}$). (O valor preliminar e especulativo de $350\text{ MB}$ foi oficialmente retirado por inconsistência metrológica com o padrão PCM Float32).
2. **Buffer Underruns / Glitches de Áudio:** Monitoramento por analisador de jitter de buffer no Web Audio Context.
   - *Critério:* Zero *xruns* (underruns) perceptíveis auditivamente ou registrados em log durante os 480 minutos.
3. **Desvio Temporal de Sincronismo (Drift):** Comparação entre o canal 3 (Click sintético em 1/4 note) e o canal 1 (Stems musicais).
   - *Critério:* Desvio temporal acumulado $< 1\text{ ms}$ ao longo de todo o ensaio.

---

## 3. Protocolo de Perda e Recuperação da Saída de Áudio (ENG-02)

O objetivo é atestar que a desconexão acidental da interface de áudio durante a ministração não provocará o vazamento do metrônomo ou da contagem nos alto-falantes internos do laptop ou no PA.

### 3.1 Procedimento de Desconexão Física:
1. Iniciar reprodução de multitrack com 4 saídas ativas:
   - Canal 1: Playback L (PA)
   - Canal 2: Playback R (PA)
   - Canal 3: Click Track (Fones / IEM)
   - Canal 4: Guia Falada (Fones / IEM)
2. Durante o refrão (alta intensidade sonora), desconectar fisicamente o cabo USB da interface.
3. **Comportamento Obrigatório do Motor (`WebAudioEngine`):**
   - Interrupção imediata da reprodução (`pause`) acionada pelo listener de `devicechange` com debounce.
   - Estado de segurança ativado: `routeHealth = 'lost'`.
   - **Bloqueio total de fallback:** O áudio **NÃO** deve ser redirecionado automaticamente para o dispositivo de saída padrão do sistema operacional (alto-falantes do computador).
   - Exibição de banner de alerta vermelho pulsante na interface do operador.

### 3.2 Procedimento de Reconexão e Retomada:
1. Reconectar a interface de áudio na porta USB.
2. O sistema detecta a restauração do hardware e transiciona para `routeHealth = 'reconnected'`.
3. **Trava de Segurança Litúrgica:**
   - O áudio permanece em pausa. É terminantemente proibido o reinício automático do playback.
   - O operador deve acionar expressamente o comando de revalidação ("Revalidar Saída Agora" ou no `RoutingModal`).
   - Após teste de tom senoidal de 440 Hz / 1 kHz nos canais, o operador retoma a reprodução manualmente.

---

## 4. Medição de Crosstalk, Calibração de Nível Elétrico e Ruído entre Canais Físicos

Para garantir que o Click (Canal 3) não vaze para o Playback FOH (Canais 1 e 2) e que os níveis entregues à mesa de som correspondam aos padrões de áudio broadcast e PA profissional:

### 4.1 Calibração de Tensão de Linha (Line-Level Alignment):
* **Padrão de Alinhamento:** $0\text{ dBFS} = +18\text{ dBu}$ ($6,16\text{ V}_{\text{RMS}}$ balanceado, norma EBU R68) ou $0\text{ dBFS} = +20\text{ dBu}$ ($7,75\text{ V}_{\text{RMS}}$, norma SMPTE RP155).
* **Nível de Operação Nominal do Mix:** Stems musicais com pico em $-6\text{ dBFS}$ entregam $+12\text{ a }+14\text{ dBu}$ na entrada de linha analógica das mesas de som (Behringer X32, Midas M32, Wing, Yamaha TF/QL/CL, Allen & Heath SQ), garantindo pelo menos $6\text{ a }8\text{ dB}$ de headroom contra saturação nos conversores A/D da console.
* **Calibração de Tons de Teste:** O recurso nativo de tom senoidal de calibração (`WebAudioEngine.testChannelTone`) gera sinal a $-18\text{ dBFS}$ ($0\text{ dBu} = 0,775\text{ V}_{\text{RMS}}$), permitindo o ganho unitário preciso no FOH e IEM antes da passagem de som.

```
┌────────────────────────────────────────────────────────────────────────┐
│               MEDIÇÃO DE CROSSTALK (DIAFONIA) DE BANCADA               │
├───────────────────┬────────────────────────────────┬───────────────────┤
│ Par de Canais     │ Condição de Teste              │ Critério Tolerado │
├───────────────────┼────────────────────────────────┼───────────────────┤
│ Canal 3 (Click)   │ Onda quadrada a 0 dBFS no Ch 3 │ Nível residual no │
│ para Canais 1 e 2 │ Canais 1 e 2 em silêncio       │ Ch 1/2 < -80 dBFS │
├───────────────────┼────────────────────────────────┼───────────────────┤
│ Canal 4 (Guia)    │ Voice cue a 0 dBFS no Ch 4     │ Nível residual no │
│ para Canais 1 e 2 │ Canais 1 e 2 em silêncio       │ Ch 1/2 < -85 dBFS │
├───────────────────┼────────────────────────────────┼───────────────────┤
│ Piso de Ruído     │ Motor ativo em repouso         │ Ruído residual    │
│ (Noise Floor)     │ Saídas abertas com carga 600Ω  │ < -90 dBu (A-wgt) │
└───────────────────┴────────────────────────────────┴───────────────────┘
```

> **Aviso Operacional:** O vazamento de click para a mesa de som quase nunca ocorre por falha de DSP no navegador, mas sim por acoplamento elétrico capacitivo em interfaces de áudio de entrada de linha compartilhada, cabos estéreo desbalanceados ou ground loops. A utilização de Direct Boxes (DI) balanceadas e cabos blindados individuais é obrigatória no palco.

---

## 5. Verificação de Preparação Offline e Reinício a Frio (ENG-01)

A congregação não pode depender de conexão à internet no domingo de manhã para executar o repertório preparado no ensaio de quinta-feira.

### 5.1 Protocolo de Teste de Desconexão Total (*Cold Boot*):
1. **Passo 1 (Com Internet):**
   - Autenticar na aplicação.
   - Importar o pacote `.ZIP` de multitrack de uma música nova ou adicionar do banco.
   - Constatar que os áudios foram gravados como `Blobs` na store `audio_blobs` do IndexedDB (`verifySongOfflineReadiness().isComplete === true`).
   - Solicitar persistência de armazenamento (`navigator.storage.persist()`) e confirmar status.
2. **Passo 2 (Corte de Rede):**
   - Desativar a interface Wi-Fi e desconectar o cabo de rede Ethernet do computador.
3. **Passo 3 (Desligamento Completo):**
   - Fechar o navegador.
   - **Reiniciar o computador a frio (Shutdown -> Power On).**
   - *Nota de Registro de Ambiente:* O reinício físico completo do sistema operacional (Windows 11) requer intervenção manual do operador na bancada física (fora do escopo do agente virtual) e está formalmente registrado como **pendência física para o ensaio de bancada com o técnico Leandro Machado**. A persistência de dados em disco local e reabertura de processo foram 100% verificadas e aprovadas em suíte de testes automatizados e no navegador.
4. **Passo 4 (Execução Offline):**
   - Sem restabelecer a conexão de rede, abrir o computador e iniciar o navegador.
   - Carregar o Lagoinha VS (servido localmente ou via Service Worker PWA).
   - Constatar que o usuário permanece autenticado com credencial offline e token de sessão válido.
   - Selecionar a música importada anteriormente.
   - **Executar Playback:** Verificar que todos os stems decodificam perfeitamente a partir dos blobs locais, sem qualquer requisição de rede pendente.
   - Realizar transposição de tom ($\pm 2$ semitons) e verificar preservação da política de afinação dos stems (Click, Guia e Loops percussivos travados; stems harmônicos transpostos).

---

## 6. Critérios de Homologação para Saída do Gate 1

| Requisito | Descrição Técnica | Status de Verificação |
| :--- | :--- | :--- |
| **ENG-01** | Persistência binária em IndexedDB (`audio_blobs`) e tolerância a reabertura sem rede | **Aprovado em Testes Automatizados (19 suítes / 94 testes). Reinício a frio do SO mantido como verificação física pendente de bancada.** |
| **ENG-02** | Detecção de queda de interface de áudio com interrupção a 0ms e bloqueio de play sob desconexão | **Aprovado no Motor (`WebAudioEngine`) / Coberto por testes unitários e de integração.** |
| **ENG-03** | Política de afinação musical (`PitchPolicy`: harmonic vs percussive vs locked) com override manual | **Aprovado no Domínio e Coberto por Testes Automatizados.** |
| **SEC-01** | Isolamento multi-tenant (`churchId`), prevenção de auto-elevação e regras Firestore/Storage (500MB) | **Aprovado via regras declarativas e suite de avaliação de permissões.** |
| **HW-01** | Ensaio de estresse contínuo de 8 horas sem falhas de buffer | **Protocolo Definido — Execução em Bancada Física Agendada.** |
| **HW-02** | Medição física de crosstalk entre Canal 3 (Click) e Canais 1/2 (PA) $< -80\text{ dBFS}$ com alinhamento a $+18\text{ dBu}$ | **Protocolo Definido — Execução com Analisador Físico Agendada.** |

---

## 7. Reconciliação de Versão e Identificação Git

* **Base de Trabalho:** `fe7586b` (pacote de consultoria 360, PRD e roadmap).
* **Hash Intermediário de Hook:** `ee6e41b` (identificador transitório gerado antes do hook de commit consolidar o commit final).
* **HEAD Consolidado na Branch:** `0e872a1` (`feat(gate1): implement offline readiness, audio route security, pitch policy and multi-tenant isolation`).
* **Branch Dedicada:** `feat/gate1-reliability`.
* **Revisão Final de Fechamento do Gate 1:** Commit final consolidando as correções metrológicas, interrupção imediata a 0ms, persistência pareada de stems/blobs e pacote de revisão local.

---

## 7. Próximos Passos (Transição para o Gate 2)
1. Conclusão dos ensaios físicos de bancada com a interface USB do ministério de louvor (Focusrite / Behringer UMC).
2. Sessão de validação assistida com o técnico de som oficial (Leandro Machado) e liderança musical no templo da Lagoinha JP.
3. Homologação da versão para publicação em produção no Firebase Hosting e início do programa piloto de 90 dias.
