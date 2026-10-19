# 04 — Arquitetura de Software e Decisões de Engenharia (ADRs)
## Engenharia de Áudio, Runtimes e Estratégia de Migração Incremental

**Data:** 19/10/2026  
**Autor:** Conselho Técnico de Arquitetura de Software e DSP  
**Status:** Aprovado para Roadmap de Engenharia  

---

## 1. Avaliação Crítica das Três Opções de Runtime

A escolha do runtime de execução do motor de áudio é a decisão arquitetural mais crítica do projeto. Analisamos detalhadamente as três opções viáveis:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   COMPARAÇÃO DAS OPÇÕES DE RUNTIME                     │
├──────────────────────────┬───────────────────────┬─────────────────────┤
│ OPÇÃO 1: PWA Web Audio   │ OPÇÃO 2: Tauri/Electron│ OPÇÃO 3: Motor Nativo│
│ (Navegador Chrome/Edge)  │ Desktop Wrapper       │ C++/Rust (JUCE/ASIO)│
├──────────────────────────┼───────────────────────┼─────────────────────┤
│ • Zero instalação prévia │ • App com ícone no OS │ • Acesso ASIO direto│
│ • setSinkId via WASAPI   │ • Acesso a disco nativo│ • Latência ultra baixa│
│ • Portabilidade instantânea│ • Ainda usa Web Audio │ • Alto custo engenharia│
│ • Depende de navegador   │ • Não dá ASIO direto  │ • Reescrita do motor│
└──────────────────────────┴───────────────────────┴─────────────────────┘
```

### Opção 1: PWA Web Audio (Chrome / Edge no Windows) — *Abordagem Atual*
* **Como funciona:** O player roda diretamente no navegador moderno com aceleração de hardware e Web Audio API.
* **Prós:** Zero atrito de distribuição (basta acessar a URL); atualizações instantâneas via deploy no Firebase Hosting; suporte nativo a `setSinkId` para selecionar placas USB; compatível com IndexedDB para armazenamento offline.
* **Contras:** Não acessa drivers ASIO de baixa latência diretamente (depende do subsistema WASAPI do Windows); risco de o operador fechar a aba por engano; restrições de sandbox de arquivos locais.
* **Veredito:** **MANTIDA PARA O PILOTO (GATE 0 E 1).** O motor atual já demonstrou estabilidade suficiente para o culto com a devida configuração no Windows.

### Opção 2: Desktop Wrapper Controlado (Tauri v2 ou Electron)
* **Como funciona:** Empacotamento da interface React existente dentro de uma aplicação desktop nativa (.exe para Windows).
* **Mito Desmentido:** Empacotar com Electron ou Tauri **NÃO** concede magicamente acesso ASIO nem transforma o áudio em nativo se o código continuar usando `new AudioContext()`. O Web Audio continua passando pelo subsistema Chromium/WDM.
* **Benefício Real:** Impede fechamento acidental da aba, remove barras de navegação do browser, permite trava de modo tela cheia exclusiva, acesso direto a arquivos no sistema operacional sem limite de cota do navegador e autostart com o Windows.
* **Veredito:** **PASSO NATURAL PARA O PRODUTO COMERCIAL (GATE 2).** Tauri v2 é preferível ao Electron por gerar binários muito menores (~15 MB vs ~120 MB) e consumir até 70% menos memória RAM.

### Opção 3: Motor Nativo C++ / Rust (JUCE ou Rodio / Miniaudio) com Frontend Web
* **Como funciona:** O motor de áudio roda como um serviço nativo C++ com acesso direto aos drivers ASIO do fabricante, comunicando-se com a UI React via IPC ou WebSockets locais.
* **Prós:** Latência ultrabaixa (< 5ms), controle exato de buffers de hardware (64 ou 128 samples), imunidade total a coletas de lixo (GC) do JavaScript.
* **Contras:** Custo de engenharia e manutenção muito elevado; compilação cruzada complexa; suporte a múltiplos drivers e crashes de drivers de terceiros.
* **Veredito:** **DESNECESSÁRIO NO MOMENTO (MEDIR ANTES DE MIGRAR).** Somente deve ser cogitado se os testes de estresse em bancada do Gate 1 com o motor Web Audio apresentarem dropouts audíveis inaceitáveis.

---

## 2. Diagrama da Arquitetura Atual (Clean Architecture)

A organização atual do repositório `lagoinha-vs` protege o investimento de engenharia:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION (React 19)                         │
│  App.tsx • StageHeader • TransportBar • MultitrackMixer • RoutingModal │
│  SectionTimeline • CifraProModal • CloudVSLibraryModal • AmbientPadBar │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (usa casos de uso e contratos)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    APPLICATION (Ports & Services)                      │
│  AudioEnginePort • AuthPort • GoogleDriveStoragePort                   │
│  MixerBusService • QuantizedSectionService                             │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│          DOMAIN (Core Puro)          │  │ INFRASTRUCTURE (Adaptadores) │
│  Song • TrackStem • Setlist • User   │  │ WebAudioEngine • PitchShifter│
│  ChordTransposer • AudioRouting      │  │ ProceduralClickGenerator     │
│  VstPluginRackService • InviteToken  │  │ ZipMultitrackExtractor       │
│  (Zero dependências externas)        │  │ IndexedDb • FirebaseAuth     │
└──────────────────────────────────────┘  └──────────────────────────────┘
```

---

## 3. O Contrato Central: `AudioEnginePort`

Para garantir que a interface nunca fique presa a uma tecnologia específica de áudio, todo o controle do player é mediado pela porta abstrata `AudioEnginePort.ts`:

```typescript
export interface AudioEnginePort {
  // Ciclo de Vida e Transporte
  loadSong(song: Song): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(positionSeconds: number): void;
  panic(): void; // Interrupção de emergência em 100ms

  // Mixagem e Dinâmica de Pistas
  setStemVolume(stemId: string, volume: number): void;
  setStemPan(stemId: string, pan: number): void;
  toggleStemMute(stemId: string): void;
  toggleStemSolo(stemId: string): void;
  setMasterVolume(volume: number): void;

  // Processamento e Tonalidade (Harmônica)
  setPitchShiftSemitones(semitones: number): void;

  // Hardware e Roteamento Multicanal
  detectAudioDevices(): Promise<AudioOutputDeviceInfo[]>;
  setAudioOutputDevice(deviceId: string): Promise<boolean>;
  setRoutingMode(mode: 'stereo' | 'split-lr' | 'multi-4ch'): void;
  testChannelTone(channelIndex: number, durationMs?: number): void;

  // Assinatura de Estado
  subscribeState(callback: (state: AudioEngineState) => void): () => void;
}
```

---

## 4. Orçamento de Recursos e Gerenciamento de Memória (RAM Budget)

### Diagnóstico de Consumo de Memória:
* Um arquivo `.mp3` comprimido de 5 minutos ocupa cerca de **8 a 12 MB** no disco.
* Ao ser decodificado via `AudioContext.decodeAudioData()`, ele é transformado em buffers **PCM Float32 (32-bit / 44.1kHz ou 48kHz)**.
* **Cálculo de 1 Música com 13 stems estéreo:**
  $$\text{Memória} = 13 \times 2 \times 48.000 \times 300 \times 4 \text{ bytes} \approx 1,50 \text{ GB de RAM pura}$$

### Política Obrigatória de Otimização de Memória:
1. **Decodificação Lazy (Just-In-Time):** Apenas a música em execução e a próxima música imediata do setlist são decodificadas na memória RAM.
2. **Descarte Ativo de Áudio Passado:** Ao transitar para a música seguinte, as referências de buffers da música anterior são imediatamente desconectadas e limpas para liberação pelo Garbage Collector (GC).
3. **Conversão Mono para Stems Centrais:** Stems que possuem informação mono idêntica em ambos os lados (Click, Guia, Baixo, Bumbo) são convertidos para `AudioBuffer` de canal único (Mono), reduzindo o consumo de memória dessas pistas em **50%**.
4. **Teto Operacional Garantido:** Consumo total de RAM do processo Chromium limitado a no máximo **1,8 GB**, rodando com folga em computadores com 8 GB ou 16 GB de RAM.

---

## 5. Estratégia de Isolamento Multi-Tenant na Nuvem

Para a transição de um projeto interno para uma plataforma comercial SaaS:
1. **Identificador Global de Organização (`churchId` / `tenantId`):**
   * Cada registro no Firestore e cada arquivo salvo na nuvem é obrigatoriamente associado a um `tenantId`.
2. **Regras de Segurança no Backend (Firestore Security Rules):**
   * Nenhum usuário de uma igreja pode ler ou gravar dados de outra congregação:
     ```javascript
     match /churches/{churchId}/setlists/{setlistId} {
       allow read, write: if request.auth != null && 
         request.auth.token.churchId == churchId;
     }
     ```
3. **Storage Assinado com Expiração:**
   * O download de stems autorizados é feito através de URLs pré-assinadas temporárias com validade máxima de 60 minutos, impossibilitando raspagem pública de conteúdo.
