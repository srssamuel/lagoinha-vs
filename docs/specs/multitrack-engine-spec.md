# Especificação Técnica do Motor Multitrack — Lagoinha VS

## 1. Topologia do Grafo de Áudio

```
[AudioContext @ 44.1kHz / 48kHz]
  │
  ├── Stems de Instrumentos (Drums, Bass, Guitars, Keys, Pad, FX)
  │     └── [Source Node] ──> [Gain Node (Vol/Mute)] ──> [Pan Node] ──> [Bus Music Gain]
  │                                                                           │
  ├── Stems de Monitoração (Click / Metrônomo, Guia Vocal / Cues)             │
  │     └── [Source Node] ──> [Gain Node (Vol/Mute)] ──> [Bus Cue Gain]       │
  │                                                           │               │
  └── [Matriz de Roteamento (ChannelSplitter & ChannelMerger)]<───────────────┘
        │
        ├── Rota Split IEM / PA:
        │     - Canal 0 (Left Out): Bus Music + Bus Cue (Vai para os Fones dos Músicos)
        │     - Canal 1 (Right Out): Bus Music apenas (Vai para a Mesa de Som / PA / Transmissão)
        │
        └── Rota Stereo Completa (Ensaios / Fone Geral):
              - Canal 0 (Left Out): Bus Music L + Bus Cue L
              - Canal 1 (Right Out): Bus Music R + Bus Cue R
```

## 2. Pulo Quantizado e Navegação de Seções

1. A música é dividida em seções: `Intro`, `Verso 1`, `Verso 2`, `Pré-Refrão`, `Refrão`, `Ponte`, `Espontâneo / Vamp`, `Outro`.
2. Cada seção possui:
   - `id`: Identificador único (ex: `chorus-1`)
   - `name`: Nome legível (ex: `Refrão`)
   - `startBar`: Compasso de início
   - `barCount`: Quantidade de compassos
   - `timeInSeconds`: Tempo de início em segundos calculado a partir do BPM e fórmula de compasso
3. Quando o usuário clica em "Pular para o Refrão" durante a execução de um verso:
   - O sistema **não corta imediatamente** no meio do compasso.
   - O sistema agenda o pulo para o início do próximo compasso (`quantization = 1 bar`) ou próximo ciclo de 2 compassos.
   - O indicador visual da seção de destino fica em estado pulsante ("Queued"), permitindo ao baterista e ao ministro de louvor saberem exatamente quando a mudança vai ocorrer.
4. Função "Repetir Seção (Loop 1x / Loop Infinito)":
   - Permite manter o louvor no Refrão ou na Ponte durante ministração espontânea enquanto o Espírito Santo conduz o momento.

## 3. Gerador Procedural de Pad Contínuo ("Pad Infinito")

- Permite manter uma harmonia ambiente no tom do louvor mesmo com as tracks paradas.
- Síntese com osciladores polifônicos (Fundamental + Quinta + Oitava) com filtro passa-baixa suave (cutoff ~400Hz - 800Hz) e modulação LFO sutil.
- Transição com crossfade exponencial de 2 a 3 segundos ao trocar de tom ou desligar.
