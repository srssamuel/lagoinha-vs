# 05 — Áudio, Hardware e Protocolo de Validação de Bancada
## Homologação de Equipamentos, Roteamento Físico e Testes de Estresse

**Data:** 19/10/2026  
**Especialidade:** Engenharia de Áudio ao Vivo, Acústica e Sistemas de Monitoração  
**Responsável Técnico:** Conselho de Engenharia de Áudio  

---

## 1. Matriz de Homologação de Hardware de Áudio

Para garantir confiabilidade de palco sem surpresas no momento do culto, o sistema categoriza os dispositivos de áudio em três níveis de certificação:

| Equipamento / Interface | Tipo de Conexão | Saídas Físicas | Compatibilidade Web Audio / WASAPI | Procedimento de Configuração | Nível de Homologação |
| :--- | :--- | :---: | :---: | :--- | :---: |
| **Behringer UMC404HD** | USB 2.0 (ASIO / WDM) | 4 saídas line analógicas (P10 / RCA) | **Excelente (Nativo)** | Plug-and-play. O driver Behringer expõe 4 canais ao Windows automaticamente. | **CERTIFICADO OURO (Padrão Piloto)** |
| **Behringer XR18 / MR18** | USB 2.0 (Interface Integrada) | 18 canais USB | **Excelente (Nativo)** | Plugar cabo USB direto do notebook na mesa. Rotear canais USB 1/2 para FOH e 3/4 para Aux 1/2 (IEM). | **CERTIFICADO OURO** |
| **Behringer X32 / M32** | Placa de Expansão X-USB | 32 canais USB | **Excelente (Nativo)** | Conectar via USB. Configurar card routing na mesa para receber inputs USB nos canais desejados. | **CERTIFICADO OURO** |
| **Focusrite Scarlett 4i4 / 8i6** | USB-C (Focusrite Control) | 4 a 6 saídas line analógicas | **Excelente (Nativo)** | Instalar Focusrite Control e habilitar saídas 1-4 no mixer de hardware. | **CERTIFICADO PRATA** |
| **PreSonus StudioLive / AudioBox** | USB 2.0 | 4 ou mais saídas | **Boa** | Requer instalação do driver Universal Control no Windows. | **CERTIFICADO PRATA** |
| **VB-Audio Virtual Cable / VoiceMeeter** | Cabo Virtual de Software | Até 8 canais virtuais | **Requer Ajuste Manual** | **Atenção:** O Windows cria como estéreo por padrão. Obrigatório ir em `mmsys.cpl` -> Configurar Alto-falantes -> Quadrafônico (4 canais). | **HOMOLOGADO PARA TESTES / TRANSMISSÃO** |
| **Placa Integrada (Realtek / Saída P2)** | Conector de Fone de Ouvido | 2 canais (Estéreo) | **Modo de Emergência Apenas** | Utiliza o modo **Split L/R**: Canal L = PA mono da igreja; Canal R = Click + Guia para fones. | **CONTINGÊNCIA DE EMERGÊNCIA** |

---

## 2. Mapa do Roteamento de Sinal e Patch da Mesa de Som

O fluxo físico de conexão entre o computador do playback, a interface USB, a mesa de som e os fones in-ear dos músicos deve seguir rigorosamente o padrão abaixo:

```
[ COMPUTADOR DO LOUVOR (LAGOINHA VS) ]
                  │
                  ▼ (Cabo USB)
[ INTERFACE MULTICANAL (ex: UMC404HD / XR18) ]
   ├── Saída Line 1 (P10 Balanceado) ────> Mesa de Som Canal 1  [FOH Left  -> PA e Live]
   ├── Saída Line 2 (P10 Balanceado) ────> Mesa de Som Canal 2  [FOH Right -> PA e Live]
   ├── Saída Line 3 (P10 Balanceado) ────> Mesa Auxiliar / Fones [Click Track -> Músicos]
   └── Saída Line 4 (P10 Balanceado) ────> Mesa Auxiliar / Fones [Voice Guia  -> Músicos]

REGRA CRÍTICA NA MESA DE SOM (FOH):
- Canais 1 e 2: Enviados para o Master Stereo (PA da Congregação e Transmissão).
- Canais 3 e 4: ROTEAMENTO PROIBIDO PARA O MASTER STEREO. Devem ser enviados 
                EXCLUSIVAMENTE para as vias de fone auxiliar (Aux / Bus In-Ear).
```

---

## 3. Protocolo de Verificação Pré-Culto (Teste de Tom Line-Level)

Para que o técnico de áudio ou voluntário aprove o sistema em menos de 1 minuto antes do início do culto, o sistema conta com um gerador interno de tons senoidais de teste line-level:

```
┌────────────────────────────────────────────────────────────────────────┐
│             MATRIZ DE TONS DE TESTE ISOLADOS POR CANAL                 │
├─────────┬───────────────────┬───────────┬──────────────┬───────────────┤
│ Canal   │ Destino           │ Frequência│ Forma de Onda│ Ganho de Teste│
├─────────┼───────────────────┼───────────┼──────────────┼───────────────┤
│ Ch 1    │ Mesa FOH (Left)   │ 440.00 Hz │ Senoidal Pura│ -12 dBFS      │
│ Ch 2    │ Mesa FOH (Right)  │ 554.37 Hz │ Senoidal Pura│ -12 dBFS      │
│ Ch 3    │ Click Track (IEM) │ 1000.00 Hz│ Beep Rítmico │ -12 dBFS      │
│ Ch 4    │ Voice Guide (IEM) │ 880.00 Hz │ Senoidal Pura│ -12 dBFS      │
└─────────┴───────────────────┴───────────┴──────────────┴───────────────┘
```

### Roteiro de Verificação em 4 Passos:
1. O técnico clica no botão **Testar Saída 1 (FOH L)**:
   * Verifica se o medidor do Canal 1 da mesa de som acende e se o sinal soa na caixa esquerda do templo.
2. O técnico clica no botão **Testar Saída 2 (FOH R)**:
   * Verifica se o medidor do Canal 2 da mesa de som acende e se o sinal soa na caixa direita do templo.
3. O técnico clica no botão **Testar Saída 3 (Click IEM)**:
   * O baterista e a banda confirmam que ouviram o beep agudo de 1 kHz em seus fones de ouvido.
   * **Conferência de Segurança:** O técnico confirma que as caixas principais do templo (PA) estão em silêncio absoluto.
4. O técnico clica no botão **Testar Saída 4 (Guia IEM)**:
   * A banda confirma a voz guia nos fones; o PA da congregação permanece totalmente em silêncio.

---

## 4. Bateria de Testes de Estresse em Bancada (Gate 1)

Antes de autorizar o uso em cultos oficiais ou comercialização, o sistema deve ser submetido à seguinte bateria de testes automatizados e supervisionados em laboratório:

### Teste 1: Resistência Contínua de Longa Duração (8 Horas)
* **Objetivo:** Garantir que o motor não apresente vazamento de memória (memory leak) ou travamentos acumulados de Garbage Collection.
* **Metodologia:** Reproduzir em loop ininterrupto um repertório de 8 músicas com 13 stems durante 8 horas em um computador com Windows 11 e 8 GB de RAM.
* **Critério de Sucesso:** Zero dropouts de áudio audíveis; consumo de memória RAM estabilizado abaixo de 1,5 GB ao longo de todo o período.

### Teste 2: Estresse de Navegação e Transição Rápida (100 Ciclos)
* **Objetivo:** Simular um ministro de louvor espontâneo saltando seções rapidamente.
* **Metodologia:** Executar 100 comandos de salto de seção, ativação/desativação de loop e troca de tom em intervalos menores que 2 segundos.
* **Critério de Sucesso:** Nenhum crash da aba; nenhuma perda de sincronismo entre pistas; travamento estrito na cabeça do compasso musical.

### Teste 3: Desconexão e Falha Física da Interface USB (20 Ciclos)
* **Objetivo:** Validar o comportamento do sistema diante de falhas de cabo ou remoção acidental da interface multicanal.
* **Limitação Técnica Reconhecida:** O evento `devicechange` informa que o catálogo de dispositivos mudou; ele é assíncrono e não fornece garantia temporal determinística em microssegundos antes de o Windows tentar transferir o fluxo de áudio para a saída padrão (ex: alto-falantes internos do laptop).
* **Metodologia de Bancada:** Puxar o cabo USB da interface durante a reprodução da música com faders abertos; monitorar a saída física do laptop com osciloscópio / RTA para medir se houve qualquer transiente sonoro residual.
* **Critério de Sucesso do Software:**
  * O listener com debounce (300ms) reavalia a enumeração e constata a perda do dispositivo selecionado.
  * O motor executa **interrupção de emergência (`pause()` e cancelamento de agendamento)**.
  * **BLOQUEIO DE FALLBACK:** O sistema trava a saída e NÃO redireciona o fluxo para a saída padrão do sistema.
  * O estado `routeStatus = 'lost'` é publicado para a interface gráfica, exibindo modal de alerta de emergência.
  * Ao reconectar a interface, o estado transita para `'reconnected'`, exigindo ação explícita do operador para revalidar a rota antes de qualquer retomada.

### Teste 4: Medição de Isolamento e Relação Sinal-Ruído (Validação Física em Bancada)
* **Objetivo:** Comprovar a ausência de crosstalk (vazamento elétrico/digital) entre os barramentos privados (Click/Guia) e públicos (FOH).
* **Distinção de Evidências:** Teste unitário prova isolamento no grafo digital (-$\infty$ dBFS). A medição física em bancada analisa vazamento analógico no conversor D/A da interface e cabos P10/XLR balanceados.
* **Metodologia:** Enviar sinal senoidal em nível de pico (0 dBFS a 1 kHz) exclusivamente nos canais 3 e 4 (Click e Guia); medir com analisador de áudio nas saídas físicas 1 e 2 (FOH L/R) e no barramento Master LR da mesa de som.
* **Critério de Sucesso:** Sinal residual nas saídas 1 e 2 inferior a **-85 dBFS** (piso de ruído analógico aceitável para sistemas de PA profissionais).

