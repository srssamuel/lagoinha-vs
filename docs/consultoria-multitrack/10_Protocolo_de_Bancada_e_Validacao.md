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
   - *Critério:* Ausência de vazamento progressivo de memória (*memory leak*). O consumo deve se estabilizar no patamar nominal do orçamento previsto ($\approx 350\text{ MB}$ para música ativa + transição).
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

## 4. Medição de Crosstalk e Ruído entre Canais Físicos

Para garantir que o Click (Canal 3) não vaze para o Playback FOH (Canais 1 e 2), a medição física deve ser realizada nas saídas analógicas da interface:

```
┌────────────────────────────────────────────────────────────────────────┐
│               MEDICÃO DE CROSSTALK (DIAFONIA) DE BANCADA               │
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
| **ENG-01** | Persistência binária em IndexedDB (`audio_blobs`) e tolerância a cold boot sem rede | **Aprovado em Testes Automatizados / Pendente Validação de Hardware Físico** |
| **ENG-02** | Detecção de queda de interface de áudio com mute imediato e trava contra remapeamento espúrio | **Aprovado no Motor / Validado em Mocks de Eventos** |
| **ENG-03** | Política de afinação musical (`PitchPolicy`: harmonic vs percussive vs locked) com override manual | **Aprovado e Coberto por Testes Unitários** |
| **SEC-01** | Isolamento multi-tenant (`churchId`), prevenção de auto-elevação e regras Firestore/Storage | **Aprovado no Domínio e Regras Declaradas** |
| **HW-01** | Ensaio de estresse contínuo de 8 horas sem falhas de buffer | **Protocolo Definido — Execução em Bancada Agendada** |
| **HW-02** | Medição física de crosstalk entre Canal 3 (Click) e Canais 1/2 (PA) $< -80\text{ dBFS}$ | **Protocolo Definido — Execução com Analisador Agendada** |

---

## 7. Próximos Passos (Transição para o Gate 2)
1. Conclusão dos ensaios físicos de bancada com a interface USB do ministério de louvor (Focusrite / Behringer UMC).
2. Sessão de validação assistida com o técnico de som oficial (Leandro Machado) e liderança musical no templo da Lagoinha JP.
3. Homologação da versão para publicação em produção no Firebase Hosting e início do programa piloto de 90 dias.
