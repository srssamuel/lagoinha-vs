# Reconciliacao da migracao (2026-10-21)

Somente totais agregados (sem nomes, caminhos nem ids). A versao completa fica fora do git.
Inventario de referencia: execucao 4.

## Prova de soma

| Verificacao | Resultado |
|---|---|
| Soma dos arquivos (3.895) = total do inventario (3.895) | OK |
| Soma dos bytes (74.812.125.608) = total do inventario (74.812.125.608) | OK |
| Todos os itens vistos no ultimo inventario | OK |
| Todo excluido tem justificativa | OK |
| Nenhum item sem bucket | OK |

Resultado geral: **OK**.

## Arquivos do Drive por situacao (inclui a lixeira)

| Situacao | Arquivos | Bytes |
|---|---:|---:|
| Pendentes (fora do escopo atual ou aguardando decisao) | 511 | 9.416.150.786 |
| Pacotes compactados cujo conteudo migrou como entradas | 1 | 8.867.159 |
| Migrados e verificados (enviados nesta migracao) | 21 | 93.193.552 |
| Na fila (descobertos/hash/enviados, ainda sem verificacao) | 888 | 60.133.707.865 |
| Excluidos com justificativa | 2.474 | 5.160.206.246 |
| **Total** | **3.895** | **74.812.125.608** |

## Por situacao e motivo

| Situacao | Motivo | Arquivos | Bytes |
|---|---|---:|---:|
| excluded | excluded: cache regeneravel do DAW (.asd); o Drive e preservado | 1.501 | 1.291.634.579 |
| excluded | excluded: na lixeira do Drive | 746 | 3.742.095.213 |
| queued | pending: sem bpm; sem compasso | 438 | 24.363.344.436 |
| queued | pending: sem compasso | 435 | 35.564.793.185 |
| pendingDecision | pending: projeto/configuracao de DAW fora do escopo de stems | 256 | 6.052.361 |
| excluded | excluded: cache regeneravel do DAW (.reapeaks); o Drive e preservado | 178 | 126.294.112 |
| pendingDecision | pending: auxiliar (capa/texto/cifra/imagem) fora do escopo de stems | 161 | 36.874.708 |
| excluded | excluded: arquivo de sistema do SO (.DS_Store/desktop.ini/Thumbs.db/resource fork) | 49 | 182.342 |
| pendingDecision | pending: tipo nao reconhecido (binary) | 26 | 14.422.998 |
| pendingDecision | pending: pacote compactado: o conteudo migra como entradas (N entradas) | 22 | 7.589.384.924 |
| pendingDecision | pending: musica sem stems (apenas mix estereo ou poucos arquivos sem nome de stem) | 20 | 651.955.273 |
| migratedVerified | pending: sem compasso | 19 | 92.229.363 |
| pendingDecision | pending: mix de referencia ou amostra junto das stems (nao e stem) | 17 | 495.842.180 |
| queued | pending: duplicata provavel: mesmos nomes de stem em outro formato/codificacao na mesma pasta de musica; decidir qual manter | 12 | 198.713.268 |
| pendingDecision | pending: tipo nao reconhecido (gzip) | 5 | 89.454 |
| queued | (sem motivo) | 3 | 6.856.976 |
| pendingDecision | pending: compactado nao-zip: inspecao ainda nao suportada | 2 | 620.531.596 |
| viaEntries | conteudo migrado como N entradas de audio (o pacote em si nao e enviado) | 1 | 8.867.159 |
| migratedVerified | (sem motivo) | 1 | 960.514 |
| pendingDecision | pending: backup de setlist: destino ainda nao previsto no contrato | 1 | 771 |
| migratedVerified | pilot: caso especial forcado para validar o pipeline (categoria normalmente fora do escopo) | 1 | 3.675 |
| pendingDecision | pending: extensao de audio, mas os bytes sao binary | 1 | 996.521 |

## Por categoria e estado

| Categoria / estado | Arquivos | Bytes |
|---|---:|---:|
| (sem categoria) | excluded | 746 | 3.742.095.213 |
| auxiliary | excluded | 49 | 182.342 |
| auxiliary | pending | 198 | 1.184.672.161 |
| backup | pending | 1 | 771 |
| pad | discovered | 3 | 6.856.976 |
| pad | published | 1 | 960.514 |
| project | excluded | 1.679 | 1.417.928.691 |
| project | pending | 256 | 6.052.361 |
| project | verified | 1 | 3.675 |
| song_stem | associated | 19 | 92.229.363 |
| song_stem | discovered | 885 | 60.126.850.889 |
| song_zip | associated | 1 | 8.867.159 |
| song_zip | pending | 24 | 8.209.916.520 |
| unknown | pending | 32 | 15.508.973 |

## Entradas de zip (derivadas dos pacotes, nao entram na soma acima)

| Situacao | Entradas | Bytes descompactados |
|---|---:|---:|
| Pendentes (fora do escopo atual ou aguardando decisao) | 16 | 178.108.988 |
| Na fila (descobertos/hash/enviados, ainda sem verificacao) | 293 | 14.655.721.692 |
| Migrados e verificados (enviados nesta migracao) | 9 | 8.164.444 |
| Ja existentes no destino e verificados | 1 | 960.514 |
| Excluidos com justificativa | 110 | 47.242.061 |

## Fora do Drive

- Arquivos so no disco (desktop.ini): 542 (190.784 bytes), fora do inventario do Drive.

## Musicas no Firestore (alvo configurado)

- Por status: {"duplicate":18,"pending":67,"ready":1}; por tipo: {"pad":4,"song":82}.
