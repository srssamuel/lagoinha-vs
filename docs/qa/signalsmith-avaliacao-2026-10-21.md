# Signalsmith Stretch x shifter granular — experimento isolado (2026-10-21)

> **Atualização (2026-10-22, stems reais):**
> - **Material:** violão, teclas, baixo, pad, BGV e soma, em ±1, ±2 e ±3 semitons, com retorno a 0 e estresse. Detalhes em `03_LABS_E_EXPERIMENTOS/audio-real-stems-2026-10-22/RESULTADO.md`.
> - **Qualidade:** o Signalsmith segue melhor em nível e alinhamento. A perda de RMS foi de −0,1 a −0,3 dB contra −0,5 a −1,5 dB do granular, e a dispersão dos ataques foi de 3,9 ms contra 7,4 ms.
> - **Custos:** a latência continua em 120 ms. O CPU do insert é cerca de 2,1 vezes o do granular, medido no Chromium de mesa.
> - **Estalos:** nenhum clipping e nenhum estalo nos dois motores.
> - **Falha silenciosa:** a "falha silenciosa" abaixo era uma corrida do harness offline, em que o comando chegava ao worklet depois do início do render. Não é defeito da biblioteca: ao vivo, foram 0 falhas em 25 criações. Uma integração deve esperar `latency()` antes de liberar o play.
> - **Decisão mantida:** o granular continua no ao vivo. O pré-render de variantes, com Signalsmith offline, passa a ser o candidato prioritário (ver a spec, seção 4).
> - **Pendente:** escuta cega, com os pares em `%LOCALAPPDATA%\lagoinha-vs\relatorios\audio\real-stems-2026-10-22\cego\`, e teste no tablet.

Decisão: **não trocar agora.** Aprofundar com escuta cega e teste em tablet com a interface USB.
O laboratório ficou fora do repositório (`03_LABS_E_EXPERIMENTOS/signalsmith-vs-granular-2026-10-21/RESULTADO.md`); nada do app foi alterado.

## Candidato

- `signalsmith-stretch` 1.3.2, licença MIT declarada no `package.json` (o tarball não traz arquivo LICENSE), WASM embutido de 64 KB.
- Carrega sem rede e sem requisições. O JS a pôr no precache tem 113 KB (40–47 KB comprimido). Exige contexto seguro.

## Medido (render offline no Chromium, +2 / −2 / +5 / −3 semitons)

| Métrica | Granular (atual) | Signalsmith (preset default) |
|---|---|---|
| Latência própria | 21 ms | 120 ms |
| Ataque × Pitch Lock, média | −5,9 a +0,3 ms | −0,13 a −0,02 ms |
| Pior evento × Pitch Lock | 8,7 a 13,8 ms | ≤ 0,3 ms |
| Erro de afinação (senoide) | 8 a 18 cents | 0,6 a 3,5 cents |
| Buraco de nível (senoide) | −10 a −11,5 dB | ≤ 0,2 dB |
| Perda de RMS | 1,2 a 2,9 dB | ≤ 0,3 dB |
| CPU, 8 stems estéreo | 4,7% de 1 núcleo | 16,2% (~3,7x) |
| Memória do renderer | 42 MB | 63 MB |

- Os dois motores: sem estalo e sem clipping. Click e guia ficam fora do FOH em SPLIT_IEM_PA e MULTI_4CH_DISCRETE; o controle positivo detecta o vazamento.
- A qualidade do Signalsmith é claramente superior nas medidas objetivas.

## O que impede a troca

1. **120 ms de latência**, cerca de 99 ms a mais em todo o playback e nos pulos quantizados. O impacto precisa ser medido no palco.
2. **Falha silenciosa:** em 2 de 25 renders idênticos com tom inicial +2, o áudio saiu sem transposição e sem erro. A causa não foi isolada.
3. **Variante de 60 ms** (menos latência): erra o acorde grave em 56 a 97 cents e travou o render offline 3 vezes.
4. **CPU ~3,7x maior** sem medição de underrun em tablet. A folga de ~2x é estimativa, não medida.
5. Material de teste limitado (um stem de violão; teclado não testado).

## Pendente (homologação)

- Escuta cega: 12 pares X/Y mais a referência, nivelados em ~−26 LUFS, em `%LOCALAPPDATA%\lagoinha-vs\relatorios\audio\signalsmith\cego\`. O gabarito fica separado, em `gabarito.json`.
- Tablet com a interface USB: CPU e underruns, latência por loopback, efeito dos 120 ms no Play e nos pulos, desconexão do cabo.
- Reproduzir e explicar a falha silenciosa antes de qualquer integração.
