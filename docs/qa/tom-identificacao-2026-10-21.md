# Identificação de tom — QA de 2026-10-21

Anonimizado: o repositório é público. Nomes de músicas, artistas, ids e caminhos do acervo ficam só nos relatórios locais (`%LOCALAPPDATA%\lagoinha-vs\relatorios\tom\`). Aqui, "Música A em F" etc.

## 1. Defeito e causa

Relato de palco: "VS em F identificou G". Causa em três camadas, reproduzidas por teste que falhava antes da mudança:

1. Tom só vinha do nome do `.zip`, por uma regex de fim de nome (`- X`) ou `Tom X`; nomes como "TITULO BPM 100 F" não casavam.
2. Sem casar, o app **assumia `G`** (ZIP, stems soltos, análise inconclusiva, upload em lote, demo) e o gravava como se fosse o tom da música.
3. O commit 6c99b70 melhorou o nome e criou a análise de áudio, mas manteve o fallback `G` e um desempate "relativo maior vence", que escolhe G quando a música é Em.

## 2. O que mudou

- **Modelo de tom** (`src/domain/value-objects/SongKey.ts`): valor (`null` = não identificado), origem (`name` | `audio` | `manual` | `legacy`), confirmado, estimado, candidatos. Registro antigo só com a string vira `legacy`, não confirmado. Confirmação manual prevalece sobre nome, áudio e análise nova (`reconcileKey`). Persistido em IndexedDB e Firestore (`keyMeta`); sem tom grava vazio, nunca `G`.
- **Parser de nomes**: tokens inteiros A–G em maiúscula; `#`, `b`, `♯`, `♭`, "sustenido", "bemol"; modo `m`, `min`, `minor`, `menor`, `maior`, `major`, `maj`; `Tom X` / `Key X` / `Tonalidade X` (aceita solfejo: "Tom Sol maior"). Letras dentro de palavras nunca são tom ("Deus", "Graça", "Bendito", "Abba"). Palavras portuguesas que coincidem com tom ("A", "E", "Em") só valem **sozinhas entre separadores** ou **coladas ao BPM**, onde nenhuma frase as usaria como palavra. Dois tons diferentes no mesmo nome = nulo. Tabela de testes positivos e negativos em `tests/unit/domain/SongKeyDetector.test.ts`.
- **Análise de áudio**: removido o desempate "relativo maior vence". Candidatos a menos de 0,05 de correlação do melhor (inclui relativos) = **ambíguo**: a análise não escolhe e mostra os candidatos para confirmar. Correlação abaixo de 0,5 = sem tom. A pontuação interna nunca aparece como porcentagem.
- **Sem tom conhecido**: reprodução original e transposição em semitons seguem; escolher **tom de destino absoluto** fica desabilitado até o tom ser do nome ou confirmado (texto curto na própria barra).
- **UI**: `KeyIdentity` (estados não identificado, ambíguo, estimado, registro antigo, do nome, confirmado), alvos de toque de 44 px, tema escuro de palco. Importar sem nome com tom roda a análise em segundo plano com progresso e botão **Cancelar** (importa sem tom).
- **Custo**: a análise saiu da thread principal (Web Worker), uma música por vez, só na importação/preparo.

## 3. Amostra do acervo

### 3.1 Metodologia

- Origem: manifesto SQLite da migração (aberto só leitura) e Google Drive para desktop (só leitura; o `ffmpeg` lê, nada é escrito em `G:`). Arquivos derivados (PCM mono de até 2 min por stem, 44,1 kHz, até 4 stems tonais na ordem baixo, teclas, pad, violão, guitarras, cordas, voz) ficam fora do git.
- A análise roda o mesmo algoritmo do domínio em Node (`scripts/key-sample.mjs`). O caminho do navegador usa o mesmo código (`computeChroma`); a decodificação pelo navegador não foi comparada com a do `ffmpeg` nesta amostra.
- Verdade: tom escrito no nome do pacote/pasta (o migrador lê o nome). Cifra não estava disponível: **quando o nome não traz tom, a verdade é incerta** e a linha diz isso.

### 3.2 (a) Parser de nome x tom verdadeiro

Todo o acervo do manifesto (64 músicas, duplicatas fora); verdade = tom que o migrador leu do nome (nulo quando o nome não traz).

| Parser | Acertos nos nomes com tom | Afirmou tom onde o nome não tem | Erro ou nulo onde o nome tem |
|---|---|---|---|
| App antigo (regex de fim de nome + fallback G) | 4/31 | 33/33 (todas viram "G") | 27 |
| 6c99b70 | 31/31 | 0/33 | 0 |
| Novo | 31/31 | 0/33 | 0 |

O único caso em que o parser novo perdeu para o 6c99b70 era o formato "C - Multitrack - Título"; entrou como regra explícita (tom de primeiro segmento só quando o segundo é "Multitrack").
O app antigo acertou só os nomes que terminam em "- X" ou "Tom X"; nos demais caía em G. É a causa do incidente "VS em F identificou G" (nome com "BPM 100 F").

### 3.3 (b) Análise de áudio x tom verdadeiro

| Música | Tom no nome (verdade) | Parser novo | Análise de áudio | Resultado | Material | Correlação interna |
|---|---|---|---|---|---|---|
| Música A | F | F | F | acerto | 4 stems tonais | 0.93 |
| Música B | G | G | A | erroOutro | 4 stems tonais | 0.96 |
| Música C | G | G | G | acerto | 4 stems tonais | 0.92 |
| Música D | G | G | Em | erroRelativo | 4 stems tonais | 0.82 |
| Música E | E | E | E | acerto | 4 stems tonais | 0.90 |
| Música F | C#m | C#m | C#m | acerto | 4 stems tonais | 0.81 |
| Música G | A | A | E | erroOutro | 4 stems tonais | 0.90 |
| Música H | A | A | F#m | erroRelativo | 4 stems tonais | 0.85 |
| Música I | Bb | Bb | F | erroOutro | 4 stems tonais | 0.91 |
| Música J | D | D | D | acerto | 4 stems tonais | 0.97 |
| Música K | C | C | C | acerto | 4 stems tonais | 0.92 |
| Música L | Gb | Gb | ambíguo (F# / Ebm) | ambiguoComVerdade | 4 stems tonais | 0.80 |
| Música M | A | A | A | acerto | 4 stems tonais | 0.83 |
| Música N | C | C | C | acerto | 4 stems tonais | 0.92 |
| Música O | D | D | D | acerto | 4 stems tonais | 0.97 |
| Música P | sem tom no nome | — | D | verdade incerta | 3 stems tonais | 0.88 |
| Música Q | sem tom no nome | — | Db | verdade incerta | 3 stems tonais | 0.98 |
| Música R | sem tom no nome | — | Am | verdade incerta | 2 stems tonais | 0.69 |
| Música S | sem tom no nome | — | E | verdade incerta | 4 stems tonais | 0.94 |
| Música T | sem tom no nome | — | Bb | verdade incerta | 4 stems tonais | 0.94 |
| Música U | Bb | Bb | ambíguo (Dm / F / Bb) | ambiguoComVerdade | 4 stems tonais | 0.77 |
| Música V | Db | Db | ambíguo (Db / Ab / Fm) | ambiguoComVerdade | 4 stems tonais | 0.83 |

**Contagem (17 músicas com tom no nome, margem de ambiguidade 0,05):** 9 acertos, 3 ambíguas com o tom certo entre os candidatos, 2 erros por tom relativo (G lido como Em, A lido como F#m), 3 erros por outro intervalo (G lido como A, A lido como E, Bb lido como F). Nenhuma sem tom. As 5 músicas sem tom no nome têm verdade incerta e ficam fora da contagem; o app mostra o que a análise achou como estimativa, nunca como tom confirmado.

**Leitura honesta:** o áudio sozinho acerta cerca de 9 em 17 de forma conclusiva e inclui a resposta em 12 em 17 (acerto mais ambíguas). Os 5 erros conclusivos têm correlação alta (0,82 a 0,96), então a pontuação interna não serve como certeza, e por isso a interface não mostra porcentagem. Três dos erros são a quinta ou a relativa, confusões típicas de croma de baixo e teclado em pads sustentados. O nome continua sendo a fonte preferida; a análise de áudio só preenche quando o nome não traz tom, e marca como estimado, pedindo confirmação.

**Sensibilidade da margem (mesma amostra):** 0,03 e 0,05 dão o mesmo resultado (9 / 3 / 2 / 3). Com 0,08: 8 acertos, 5 ambíguas com verdade, 1 ambígua sem verdade, 3 erros. Com 0,12: 7 acertos, 7 ambíguas com verdade, 1 sem verdade, 2 erros. Alargar troca acertos por ambiguidade e só elimina erros que ficam a 0,06 a 0,11 da vencedora, com 17 pontos de verdade. **Decisão: manter 0,05.** Ajustar mais com tão poucos casos seria sobreajuste; os erros conclusivos restantes são o motivo de a confirmação manual ser obrigatória para liberar o tom de destino absoluto.

## 4. Custo da análise (Chromium, Playwright)

Método: Chromium (Playwright) em servidor Vite próprio, 4 stems estéreo sintéticos de 300 s (progressão F-Bb-C-F), 3 execuções, mediana. A versão "antes" é o código do commit 6c99b70 (análise na thread principal); "depois" usa o Worker. Responsividade: atraso de um laço de 10 ms dentro da página e long tasks; memória: pico da árvore de processos do navegador. CPU 4x via CDP `Emulation.setCPUThrottlingRate`.

| Versão | CPU | Tempo total (ms) | Long tasks (qtd / maior ms) | Atraso do laço (mediana / pior ms) | Pico do navegador (MB) |
|---|---|---|---|---|---|
| antes (thread principal) | 1x | 3326 | 4 / 483 | 245 / 268 | 645 |
| depois (Worker) | 1x | 4611 | 4 / 146 | 147 / 773 | 683 |
| antes | 4x | 7259 | 6 / 1921 | 1366 / 1547 | 719 |
| depois (Worker) | 4x | 2859 | 7 / 290 | 284 / 367 | 763 |

Leitura: com CPU 4x a interface deixa de travar quase 2 s de uma vez (maior long task 1921 para 290 ms) e o tempo total cai. Com CPU normal o total do Worker fica mais alto e ruidoso (3,1 a 5,3 s entre execuções; a máquina estava ocupada por outras frentes), mas a maior tarefa longa cai de 483 para 146 ms. A memória não melhora: é dominada pelos buffers nativos da decodificação, que continua na thread principal porque `OfflineAudioContext` não existe em Worker. O heap JS fica em 2 a 3 MB nos dois casos. As long tasks que sobram vêm das cópias do PCM e do `arrayBuffer`. A análise roda uma música por vez, só na importação/preparo, com progresso e cancelamento.

Limites desta medição: stems sintéticos, não do acervo; máquina com carga concorrente; não está claro se o throttle de CPU do CDP também freia a thread do Worker (o ganho em 4x pode estar superestimado); a métrica de latência do clique em Parar foi descartada por instável. **Tablet real não foi medido.**

## 5. Auditoria dos tons já gravados no Firestore

`tools/admin/audit-song-keys.cjs` (somente leitura; credencial do dono pelo Firebase CLI, sem imprimir token). Resultado em 2026-10-21 no projeto de produção: **1 igreja, 0 músicas em `churches/*/library`, 0 em `catalog`**. Não há registro importado com `G` possivelmente de fallback no Firestore: a migração para a nuvem ainda não gravou as músicas. O migrador grava `originalKey: null` quando o nome não traz tom (nunca `G`), e o app novo lê `null` como "tom não identificado". A lista de revisão (`revisao-g.md`, local) saiu vazia. Falta auditar o que está **dentro dos aparelhos**: músicas importadas por ZIP/stems soltos com a versão antiga ficaram no IndexedDB do navegador de cada aparelho com `G` e agora entram como `legacy`, não confirmado (a UI pede confirmação antes de liberar o tom de destino).

## 6. Limites e o que não foi verificado

- **Tablet real não medido**; custo e responsividade vêm só de Chromium no notebook de desenvolvimento.
- Decodificação do navegador x `ffmpeg` não comparada: a tabela (b) usa PCM do `ffmpeg` com o mesmo algoritmo do domínio.
- Verdade do áudio = tom do nome; 5 de 22 músicas não têm tom no nome (verdade incerta). Sem cifra para conferir.
- Amostra de 22 músicas (17 com verdade), do acervo no Drive; pacotes-piloto sintéticos do repositório foram descartados porque o áudio não bate com o tom do nome.
- Confirmação manual persiste só no IndexedDB do aparelho e é reconciliada ao preparar o culto; gravar a confirmação no Firestore exige uma mudança de porta/composição fora desta frente.
- `GoogleDriveStorageService.ts` ainda tem `originalKey` fixo de demonstração; entra como `legacy`.
- Firestore sem músicas: a auditoria confirma contagem zero, não cobre os aparelhos.
- Pré-cache offline (PWA) do novo asset do Worker pertence à frente OFFLINE.
- Falhas de testes de roteamento/PitchShifter vistas durante o trabalho pertencem à frente MOTOR.
