# Bancada de áudio — medições dos stems reais (2026-10-21)

Bancada enxuta e reproduzível: `node scripts/audio-bench/measure.mjs <pasta-com-wavs> [--out relatorio.json]`.
Ela não grava nada sobre os originais, não normaliza nenhum stem e calcula a soma só em memória pelo ffmpeg.

## Ferramentas

| Ferramenta | Situação nesta máquina | Licença / fonte | Uso aqui |
|---|---|---|---|
| ffmpeg 9.0.2 (gyan.dev, winget) | instalado e executado | LGPL/GPL, ffmpeg.org | `ebur128` (LUFS integrado, LRA, true peak), `astats` (pico e RMS), `aphasemeter` (correlação L/R), `amix normalize=0` (soma) |
| DAW (REAPER, Cakewalk, Audacity...) | **nenhuma instalada** | — | sem host, não há como abrir plugins |
| Voxengo SPAN (analisador de espectro) | não instalado | gratuito, voxengo.com/product/span | plugin VST: precisa de DAW |
| Youlean Loudness Meter 2 | não instalado | versão Free gratuita, youlean.co | plugin VST/standalone; o ebur128 do ffmpeg cobre a mesma medida (EBU R128) |
| TDR Nova (EQ dinâmico) | não instalado | versão gratuita, tokyodawn.net | **é processamento, não medição**: só para teste A/B auditivo, nunca no caminho do app |

Esses plugins são de DAW. Não são bibliotecas web e não entram no app. O motor do app continua sendo o Web Audio.
Nada foi baixado nesta etapa: download de software novo depende de autorização.

## Método

- **Stems individuais:** medidos como chegaram, sem normalizar. Stems de multitrack vêm mixados entre si, e o ganho relativo entre eles faz parte da mixagem.
- **Click e guia ficam fora da referência de PA.** O filtro por nome (`click|clique|metro|guia|guide|cue|count`) tira esses stems da soma.
- **Soma de PA:** `amix normalize=0`, que soma os stems em ganho unitário, como o app faz com todos os faders em 0 dB.
- **Dobra mono:** a mesma soma em (L+R)/2. Simula o perfil "música mono + click/guia" e mede a perda por fase.

## Resultado: lote local de 13 stems (140 BPM, tom B)

| Stem | Destino | LUFS int. | True peak (dBTP) | Correlação L/R média |
|---|---|---:|---:|---:|
| BASS_1 | PA | −21,2 | −9,7 | 1,00 (mono) |
| DRUM_1 | PA | −19,9 | −1,9 | 0,56 |
| EG 1_1 | PA | −27,4 | −19,5 | 0,50 |
| EG 2_1 | PA | −25,4 | −19,7 | 0,56 |
| EG 3_1 | PA | −25,8 | −20,2 | 0,51 |
| Keys EP_1 | PA | −27,0 | −13,1 | 0,48 |
| Keys Loop_1 | PA | −31,0 | −13,4 | 0,46 |
| Keys Orgao_1 | PA | −28,8 | −17,5 | 0,56 |
| Keys Synth_1 | PA | −29,5 | −16,8 | 0,98 |
| Keys lead_1 | PA | −25,1 | −19,2 | 0,96 |
| vocals_1 | PA | −23,0 | −6,0 | 0,41 |
| CLICK_140 | só IEM | −31,8 | −8,9 | 1,00 |
| GUIA_1 | só IEM | −18,5 | −1,7 | 0,99 |
| **Soma de PA (11 stems)** | PA | **−16,7** | **+0,4** | 0,59 (mín. −0,19) |
| Soma de PA em mono | PA mono | −17,0 | +0,2 | — |

## Achados

1. **A soma de PA passa de 0 dBFS em ganho unitário: +0,4 dBTP, com pico de amostra de +0,44 dB.** Nenhum stem passa de −1,9 dBTP. O excesso vem só da soma.
   - O limitador mestre do app é um `DynamicsCompressor` (threshold −1, ratio 20, ataque de 1 ms). Isso não é brickwall: segura a maior parte, mas deixa passar transientes.
   - Correção indicada: headroom fixo na soma de PA (mestre a −3 dB, por exemplo), em vez de mais limitação. Ainda não aplicada, porque muda o nível entregue à mesa e precisa de escuta na igreja.
2. **A perda em mono é pequena: 0,3 LU, com correlação mínima de −0,19.** O perfil mono + click/guia é viável com este material.
3. **Smart Auto-Fix no import foi removido.** Os stems já chegam mixados, e EQ, drive e compressão automáticos por nome alteravam a mixagem sem pedido. O import agora fica neutro (Flat), e o rack segue disponível como escolha do músico.
4. **Saturação com drive 0 não é bypass real.** A curva identidade do `WaveShaperNode` grampeia em ±1: um seno de amplitude 1,5 sai com pico 1,003 no Chromium.
   - Trocar por `curve = null` resolveria o grampo, mas o Chromium então pula o oversample 2x e tira 128 amostras (2,7 ms) de latência só daquele stem. A medida é de impulso: posição 1128 com curva, 1000 sem curva.
   - Isso desalinharia stems com e sem drive, e por isso a troca não foi feita.
   - Correção indicada: pré-ganho de 0,25 antes do shaper, com a curva escalada ×4. Isso mantém o oversample e a latência iguais em todos os strips. Só faz efeito quando o EQ ou o shifter levam o sinal acima de 0 dBFS antes do fader.

## O que esta bancada não cobre

- **Escuta.** Nada aqui foi ouvido: as medidas são numéricas.
- **Processado pelo app.** O render do grafo de produção é feito pelo `scripts/audio-render/render-alignment.mjs`, que mede estalos, alinhamento e vazamento. Medir no mesmo formato a saída transposta do app fica para a próxima rodada.
- **Equipamento real.** A interface USB, a mesa e o PA da igreja não foram testados.
