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

## 4. Quadro por capacidade (estado em 2026-10-21)

Legenda de evidência:
- **auto**: teste ou script automatizado que pode falhar, executado;
- **medido**: render ou medição numérica;
- **ouvido**: escuta humana;
- **equip.**: equipamento real (tablet, interface USB, mesa, PA).

Os itens sem evidência marcada não foram verificados.

| Capacidade | Implementação | Evidência | Pendência | Prior. | Critério de conclusão |
|---|---|---|---|---|---|
| Acervo e backup | Migrador Drive → R2 + D1 + Firestore, com md5/sha256 conferidos e manifesto SQLite local | auto (suíte do migrador 33/33); medido (D1: 571 blobs, todos com procedência; Firestore: 41 músicas, 551 stems em versões) | Parte da origem foi removida do Drive pelo dono dos arquivos (`docs/migracao/incidente-drive-2026-10-21.md`); diferença de 20 entre blobs e stems referenciados não conciliada | P0 | Conciliação item a item: inventário = migrado + fora do acervo declarado, sem soma de sobreposição |
| Importação | Importador por zip/pasta; `add-local` para arquivo do disco usando o mesmo pipeline (hash, upload verificado, registro) | auto (teste zip → música publicada, sem duplicar); real (lote de 13 stems: 13/13 verificados, música publicada) | Tocar o lote local no app pelo fluxo da nuvem | P0 | Música importada toca no app a partir do R2, com os stems alinhados |
| Tom e transposição | `SongKey` com origem e confirmação, sem fallback G; empate maior × relativo menor = ambíguo; Pitch Lock por nome tokenizado | auto (SongKeyDetector 61 testes; PitchLockClassification 36); medido (amostra do acervo em `docs/qa/tom-identificacao-2026-10-21.md`) | Auditoria dos G históricos depende do acervo completo; escuta de stems mistos transpostos | P0 | Nenhum tom gravado sem origem; click e guia nunca transpõem nem saem no PA |
| Sincronismo | Mesmo `AudioContext.currentTime` para todos os stems; latência constante de 21 ms no caminho dry; click compensado | medido (`docs/qa/alinhamento-audio-2026-10-21.md`: transposto × Pitch Lock com cerca de 3 ms de centroide) | Erro residual de cerca de 3 ms; bypass do saturador não pode ser `curve=null` (muda 128 amostras, ver `docs/qa/bancada-audio-2026-10-21.md`) | P1 | Diferença menor ou igual a 5 ms entre caminhos em render e ouvido no palco |
| Offline | PWA com precache de todos os chunks; "Preparar e abrir offline" grava os stems do culto no IndexedDB; atualização só é oferecida depois de parar | auto (`npm run e2e:offline` em 2026-10-21: 10/10 PASS. O fluxo cobre build de produção, login, preparo do culto, reabrir sem rede e tocar, atualização v1 → v2 com reprodução ativa sem recarga, e v2 offline) | Material sintético (6 stems); o app não usa WASM hoje; falta repetir com culto real no tablet e com o aparelho reiniciado | P0 | Fluxo autenticar → preparar → fechar → sem rede → reabrir → tocar, automatizado e repetido no tablet |
| Roteamento | Matriz por `ChannelSplitter`/`Merger`; SPLIT_IEM_PA força ganho 0 de click/guia no FOH; 4 canais discretos | auto (testes de grafo e roteamento); medido (render sem vazamento, controle positivo detecta vazamento) | Perda da interface USB e soma mono só em equipamento real | P0 | Sem click/guia no PA em qualquer modo, inclusive após troca de dispositivo, medido na interface real |
| Desempenho | Shifter granular (4,7% de 1 núcleo, 8 stems) | medido (laboratório Signalsmith) | Tablet real; soma de PA chega a +0,4 dBTP em ganho unitário (limitador mestre não é brickwall) | P1 | Sem dropout em 60 min no tablet; soma de PA abaixo de 0 dBTP com headroom fixo |
| Versões e setlists | Versões por música no Firestore; setlist local | auto (testes de domínio) | Escolha de versão por culto e preparo por versão | P2 | Setlist referencia versão específica e prepara só ela |
| Autorização entre igrejas | Escopo pela URL; chave R2 por igreja; papéis lidos do Firestore com token do usuário | auto (`workers/stems` test:emu 66/66, inclusive hash ou chave de outra igreja negados e `upload_id` alheio = 404) | Correção do `upload_id` (403 → 404) ainda não publicada no Worker | P1 | Conhecer hash, chave ou id nunca concede leitura ou vínculo; teste de contrato no deploy |
| Origem e direitos | `rightsClass` e procedência por blob (`sources`) | medido (100% dos blobs com procedência) | Política de direitos por música; pasta de origem com link público | P1 | Toda música com classe de direitos e origem rastreável |
| Atualização e recuperação | Service worker; sem atualização durante a sessão | não verificado | Testar atualização com reprodução ativa e retorno após falha | P1 | Atualização nunca interrompe reprodução; app volta ao estado preparado após reinício |
| Piloto | — | — | Culto piloto com equipe de som | P1 | Um culto inteiro sem incidente de áudio, com relato da equipe |
| Evolução comercial | — | — | Depende de decisão do Samuel | P3 | Decisão registrada |
| Pré-render de variantes (experimento) | Laboratório isolado, fora do app (`03_LABS_E_EXPERIMENTOS/audio-real-stems-2026-10-22/RESULTADO.md`), com receitas por variante (motor, versão, semitons, hash do original e da variante) | medido (stems reais, 10 stems tonais em −1 e +2): preparo de ~4,3 min por música com os dois tons, +830 MB, reprodução com latência 0 e 12% de um núcleo, 20/20 com os mesmos quadros do original e ataques a ≤ 2 ms | Escuta cega dos pares; tempo de preparo e disco no tablet; não cobre troca de tom improvisada | P1 | Atrás de flag, com o granular como caminho ao vivo; adoção só depois da escuta e do tablet |
| Estéreo por stem | Cada strip soma L+R numa entrada mono do merger antes do pan (`AudioRoutingGraph.ts:152-160`) | medido (laboratório: FOH L e R saem iguais) | Preservar o estéreo do stem nos modos estéreo, sem abrir caminho de click/guia para o FOH | P1 | Correlação L/R do stem preservada na saída estéreo, com o teste de vazamento passando |
