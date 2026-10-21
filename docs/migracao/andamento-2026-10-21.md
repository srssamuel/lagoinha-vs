# Migracao Drive -> Worker (R2 + D1): andamento em 21/10/2026

So totais. Nomes de musica, ids de arquivo, hashes e caminhos do acervo ficam no manifesto local, fora do git.

## Retrato as 17:35 UTC (carga em execucao, `--concurrency 2 --retry-failed`)

| Estado no manifesto | Arquivos | Bytes |
|---|---:|---:|
| Verificados no destino | 406 | 27.776.123.157 |
| Na fila (descobertos / hash calculado) | 799 | 46.611.051.273 |
| Pendentes de decisao | 528 | 9.603.126.933 |
| Excluidos com justificativa | 2.585 | 5.207.451.982 |
| Falhas (repetidas na proxima execucao com `--retry-failed`) | 6 | 504.569.962 |

Os estados somam arquivos do Drive e entradas extraidas de compactados (o manifesto guarda os dois tipos).

Destino conferido direto no D1 (consulta somente leitura): 406 blobs no escopo da igreja, 27.776.123.157 bytes
(292 conferidos pelo R2 via SHA-256, 114 montados por multipart com tamanho conferido) e 406 registros de origem.
Bate exatamente com os 406 hashes distintos verificados no manifesto. Nenhum upload multipart aberto.

## Conciliacao parcial (reconcile, leitura do manifesto)

- Arquivos do Drive: 3.895 arquivos / 74.812.125.608 bytes no inventario; a soma dos baldes bate em arquivos e bytes.
- Todos os itens vistos no ultimo inventario; todo excluido tem justificativa; nenhum item sem balde.
- Entradas extraidas de compactados: 429 (14.890.197.699 bytes), contadas a parte para nao duplicar os bytes do pacote.
- Compactados (.zip conteiner): 25 pacotes. O pacote em si nao e enviado; suas entradas de audio sao migradas
  como blobs proprios e o pacote passa a "associado" quando todas as entradas terminam.
- Excluidos (2.475 arquivos do Drive + 110 entradas): cache regeneravel do DAW (.asd, .reapeaks), itens na lixeira
  do Drive, arquivos de sistema do SO e projeto de DAW. Todos ficam preservados no Drive.

Limite: o reconcile confere origem x manifesto x entradas; ele nao lista o bucket R2. A conferencia manifesto x D1
acima foi feita a parte. Objeto no R2 sem linha no D1 (caso abaixo) so aparece com listagem do bucket.

## Falha "multipart: completar falhou (400)"

- Causa demonstrada: a primeira tentativa do `complete` montou o objeto no R2 e caiu antes do registro no D1
  (resposta perdida). O migrador repetiu o `complete`; o R2 recusa montar o mesmo upload de novo e o Worker
  devolvia `400 invalid_parts`. Evidencia: objeto presente no R2 com tamanho e SHA-256 corretos, sem linha em
  `blobs`, `uploads` ou `sources` no D1. Reproduzido em teste no emulador (400 antes da correcao).
- Worker: `complete` repetido agora adota o objeto ja montado quando ele e deste upload (mesmo usuario, criado
  depois da abertura, tamanho declarado) e registra com 201. Publicado: Version ID `c4143b93-1e88-4897-bb33-b155b467b440`.
- Migrador: registra status, codigo do Worker, historico de tentativas, uploadId (prefixo), numero de partes,
  tamanhos e ETags (nunca o token); em conclusao ambigua consulta o destino (HEAD) antes de reenviar e, se o
  blob nao estiver registrado, faz um novo upload completo. Vale para a proxima execucao do migrador.
- O item afetado volta na proxima execucao com `--retry-failed` (novo upload sobrescreve a mesma chave e registra).

## Robustez observada

- Execucao autonoma desde 12:42 UTC, com marcos de progresso no log a cada 25 itens (ultimo: 375 as 17:27 UTC).
- Manifesto so cresce: 376 verificados as 17:22 UTC, 406 as 17:35 UTC.
- Token renovado (arquivo reescrito as 17:12:35 UTC): 37 itens verificados depois disso, 18 deles apos 17:28 UTC.
  O migrador rele o arquivo a cada requisicao, entao essas conclusoes usaram o token renovado.
