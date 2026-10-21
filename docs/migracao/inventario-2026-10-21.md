# Inventario do acervo (2026-10-21)

Somente totais agregados. Nomes, caminhos e ids do Drive ficam fora do git (manifesto local do migrador).
Fonte: SQLite de metadados do Drive para desktop (copia temporaria, somente leitura) cruzado com a pasta montada em G: (somente leitura) e com os 64 primeiros bytes de cada arquivo.

## Comparacao com a consulta anterior

| Metrica | Agora | Consulta anterior | Diferenca |
|---|---:|---:|---:|
| Arquivos ativos no Drive (fora da lixeira) | 3.149 | 3.149 | +0 |
| Pastas ativas (com a raiz) | 545 | 545 | +0 |
| Bytes ativos no Drive | 71.070.030.395 | 71.070.030.395 | +0 |
| Audios (formato real pelos bytes) | 945 | 970 | -25 |
| Compactados (formato real zip/rar/7z) | 25 | 25 | +0 |
| Arquivos no disco G: (sem desktop.ini) | 3.149 | 3.145 | +4 |
| Subpastas no disco G: | 544 | 544 | +0 |
| Bytes no disco G: (com desktop.ini) | 71.070.222.171 | 71.070.222.235 | -64 |

## Nuvem (Drive)

- Arquivos na arvore: 3.895 (69.67 GiB), dos quais na lixeira: 746 (3.49 GiB).
- Arquivos ativos: 3.149 (71.070.030.395 bytes, 66.19 GiB).
- Pastas ativas (contando a raiz): 545.

## Cruzamento nuvem x disco

- Presentes nos dois lados: 3.149 arquivos (71.070.031.387 bytes no disco); com tamanho diferente entre os lados: 4.
- So na nuvem (ativos sem arquivo em G:): 0 arquivos, 0 bytes.
- So no disco: 542 arquivos, 190.784 bytes (desktop.ini: 542 arquivos, 190.784 bytes; outros: 0 arquivos, 0 bytes); pastas so no disco: 0.

## Formato real (pelos bytes) dos arquivos ativos

| Formato real | Arquivos | Bytes |
|---|---:|---:|
| binary | 1.806 | 1.437.800.034 |
| wav | 719 | 58.297.579.018 |
| gzip | 204 | 5.678.209 |
| mp3 | 172 | 2.158.169.493 |
| ico | 79 | 27.118.524 |
| m4a | 52 | 884.774.550 |
| jpeg | 39 | 2.645.816 |
| appledouble | 24 | 46.706 |
| zip | 23 | 7.598.252.083 |
| text | 19 | 347.518 |
| png | 4 | 2.888.090 |
| ole2 | 4 | 26.624 |
| wma | 2 | 34.172.134 |
| rar | 2 | 620.531.596 |

## Mime de origem registrado no Drive (ativos)

| Mime de origem | Arquivos |
|---|---:|
| application/msword | 1.504 |
| audio/wav | 744 |
| application/octet-stream | 271 |
| application/x-gzip | 204 |
| audio/mpeg | 172 |
| image/x-icon | 79 |
| audio/mp4 | 52 |
| text/plain | 51 |
| image/jpeg | 39 |
| application/zip | 22 |
| image/png | 4 |
| audio/x-ms-wma | 2 |
| application/x-rar | 2 |
| text/x-url | 1 |
| application/x-zip | 1 |
| application/json | 1 |

## Audios e compactados por criterio

- Audios: 945 pelo formato real, 970 pelo mime de origem, 970 pela extensao.
- Compactados: 25 pelo formato real, 229 pelo mime de origem, 24 pela extensao; sem extensao .zip: 4.

## Divergencias mime/extensao/formato real

- Arquivos com alguma divergencia: 1.602.
- Tipo "mime": 1.594
- Tipo "tamanho": 4
- Tipo "ext": 25
- Tipo "sem-extensao": 4

## Explicacao das diferencas

A nuvem (Drive) bate exatamente com a consulta anterior: 3.149 arquivos, 545 pastas, 71.070.030.395 bytes, 25 compactados. As diferencas abaixo vem do disco e do criterio de classificacao.

1. **Audios 945 x 970 (-25).** A consulta anterior contou por mime/extensao (970). Pelos primeiros bytes, 25 arquivos com extensao de audio nao sao audio: 24 sao metadados AppleDouble (prefixo `._`, 46.706 bytes no total) e 1 e binario sem cabecalho de audio. Eles ficam classificados como auxiliar/desconhecido, nao descartados. Os 52 `.m4a` (cabecalho mp4 com marcas mp42/isom) contam como audio pela dica da extensao.
2. **Arquivos no disco 3.149 x 3.145 (+4).** O disco tem os mesmos 3.149 arquivos da nuvem. A consulta anterior excluia `desktop.ini`; 4 deles existem tambem na nuvem e foram contados aqui como arquivos casados (3.149 - 4 = 3.145 sem desktop.ini).
3. **Bytes no disco -64 e 4 arquivos com tamanho diferente.** Os `desktop.ini` sao regravados pelo Windows/Drive a todo momento: os 4 que existem na nuvem somam 416 bytes la e 1.408 no disco (diferenca de 992 bytes, tamanhos 104 x 352). Os demais 542 `desktop.ini` existem so no disco (190.784 bytes) e variam entre consultas (541 a 545 vistos), o que explica a variacao de 64 bytes. Nenhum arquivo de conteudo difere.
4. **Compactados.** 25 pelo formato real (23 zip + 2 rar), igual a consulta anterior. Pelo mime sao 229 porque 204 arquivos de projeto de DAW (`.als`/`.alc`) sao gzip. Um zip tem extensao fora do padrao (mime `application/x-zip`) e 4 arquivos gzip nao tem extensao.
5. **Divergencias mime x formato (1.602).** Principalmente os `.asd` (1.503) registrados com mime de documento Word, mais os 25 pseudo-audios e os 4 de tamanho. Sao classificados pelos bytes, nunca pelo mime.
