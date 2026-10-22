# Biblioteca pública (envio pelo site, publicação conferida, acesso sem convite)

Estado: implementada em 2026-10-21. A recuperação e a migração do Google Drive foram canceladas nessa data; o acervo novo entra pelo painel do site.

## 1. Objetivo

O curador abre `/admin/acervo`, envia multitracks (ZIP ou stems avulsos), revisa e publica. Qualquer pessoa abre `/biblioteca` ou `/biblioteca/{songId}` sem login, prepara a música no aparelho e toca no player, inclusive sem internet depois de preparada. O login continua existindo só para recursos pessoais (cultos da igreja, banco de VS) e para a administração.

## 2. Peças

| Peça | Onde | Papel |
|---|---|---|
| Painel do acervo | `src/presentation/pages/AdminAcervoPage.tsx` | Seleção (arquivos, pasta, arrastar), revisão, fila, publicar e retirar |
| Fila de envio | `src/application/acervo/CatalogIngestQueue.ts` | Uma entrada por música; estados; retomada; idempotência |
| Regras do pacote | `src/domain/services/CatalogPackage.ts` | Seleção → músicas (`planSelection`), leitura do nome sem valores padrão, ids estáveis |
| Cliente de envio | `src/infrastructure/storage/WorkerUploadClient.ts` | PUT único até 95 MB, multipart em partes de 32 MB acima disso, tentativas, retomada |
| sha256 no navegador | `src/infrastructure/storage/sha256Incremental.ts` | WebCrypto até 192 MB; acima disso, incremental em fatias de 16 MB |
| Fila no aparelho | `src/infrastructure/storage/IndexedDbIngestStore.ts` | Metadados, hashes e partes recebidas (o áudio não fica aqui) |
| Escrita do catálogo | `src/infrastructure/firebase/FirestoreCatalogAdmin.ts` | Música e versão no Firestore; publicar e retirar pelo Worker |
| Biblioteca pública | `src/presentation/pages/PublicLibraryPage.tsx` | Lista, página por música, preparar e abrir no player |
| Modo visitante | `src/presentation/visitorMode.ts`, `User.visitor()` | Player sem conta com o que foi preparado neste aparelho |
| Worker | `workers/stems/src/publication.ts`, `blobs.ts`, `registry.ts` | Conferência, publicação, retirada e leitura pública |
| Regras | `firestore.rules` (I7) | Visitante lê só o publicado; só curador escreve |

## 3. Fluxo e estados

Cada música na fila passa por: **revisar** → **enviando** → **verificando** → **pronto para publicar** → **publicando** → **publicado**. Os desvios são **pausado**, **falhou** (com motivo e "tentar de novo") e **selecione os arquivos de novo** (depois de recarregar a página).

1. **Seleção.** Cada ZIP vira uma música; áudios avulsos viram uma música por pasta (ou uma única música, se escolhidos soltos). O que não é áudio nem ZIP aparece em "fora da fila" com o motivo. Vários ZIPs são abertos um de cada vez (memória), todos entram na fila.
2. **Revisão.** Título, artista, tom e BPM vêm do nome do pacote quando estão lá; senão ficam **desconhecido** (tom) e **pendente** (BPM). Nada é inventado. As funções (click, guia, instrumentos) vêm do classificador do player e podem ser trocadas por stem. Direitos (classe, titular, documento) são obrigatórios para salvar; os últimos usados são pré-preenchidos.
3. **Salvar no acervo** (separado de publicar e de abrir no player). Para cada arquivo: sha256 no navegador → já existe no acervo? (HEAD) → se não, envio → **conferência no servidor** (`POST .../verify`). Depois grava música e versão no Firestore com ids estáveis.
4. **Publicar.** O Worker confere de novo e só então libera: música e versão lidas do Firestore com o token do curador, direitos, BPM entre 30 e 300, manifesto (1 a 64 stems, ao menos um de banda) e cada arquivo registrado, conferido pelo R2 (`r2-sha256`) e com o tamanho da versão. Grava `publications`, `publication_blobs` e `publication_events` no D1 e, por último, marca a música no Firestore.
5. **Visitante.** Lê no Firestore só músicas com `status == 'published'` e só a versão publicada; o Worker serve um arquivo sem login só se o sha256 pertence à versão publicada daquela música.

## 4. Upload confiável

- **Tentativas limitadas** (5) com espera crescente em rede, 408, 425, 429, 5xx, 409 `in_progress` e 401 (token renovado na próxima volta). Recusa 4xx é **definitiva** e não repete.
- **Concorrência limitada**: 2 arquivos por música, 3 partes por arquivo.
- **Falha temporária nunca aborta o multipart.** Só o **cancelamento** explícito descarta as partes (`DELETE .../multipart/{id}`). **Pausa** interrompe sem descartar.
- **Retomada pelo servidor.** A fila guarda no aparelho o `uploadId` e as partes; ao continuar, o cliente pergunta ao Worker quais partes ele tem (`GET .../multipart/{id}`, com etag e tamanho) e envia só as que faltam. Se a página recarregar, o navegador perde o acesso aos arquivos: o painel explica e pede a mesma seleção; o que já foi conferido não sobe de novo.
- **Arquivo já existente**: HEAD 200 ou 409 ao abrir/completar o multipart contam como "já no acervo" e seguem para a conferência.
- **Integridade.** A ETag do multipart **não** é tratada como sha256, e `client-declared` não conta como conferido. O PUT único é conferido pelo R2 na gravação; o multipart é conferido por `verify`, que relê o objeto pelo próprio R2 com `FixedLengthStream` + `sha256` no `put` (sem gastar CPU do Worker no plano gratuito). Conteúdo que não confere é apagado e responde 422.
- **Sem duplicar.** Ids determinísticos: `songId` = `m` + 23 hex do sha256 dos shas ordenados; `versionId` = `v` + 23 hex do sha256 do manifesto `[sha, nome, tipo, tamanho]`. Repetir salvar ou publicar não cria nada novo; publicar a mesma versão não grava evento novo.
- **R2 recebeu, metadado falhou.** Salvar de novo encontra os arquivos já conferidos (HEAD) e só regrava o Firestore. Na publicação, o D1 é gravado antes e o Firestore por último; se o Firestore falhar, o Worker responde 502 `metadata_not_saved` e repetir conclui.

## 5. Preservação

- Bucket `lagoinha-vs-stems` sem regra de expiração; chaves por sha256 (conteúdo imutável).
- Versões imutáveis: a versão existente nunca é regravada; mudança de função ou de arquivo gera versão nova.
- **Retirar** esconde da biblioteca (D1 `withdrawn`, Firestore `withdrawn`) sem apagar nada; **republicar** volta a mesma versão. O Worker recusa apagar arquivo de versão publicada (409 `published_blob`).
- Backup: ver `docs/operacao/backup-acervo.md`.

## 6. Limites conhecidos

- O `songId` nasce do conjunto de arquivos: trocar um arquivo de áudio gera outra música no catálogo (metadados e funções mudam só a versão).
- ZIP é aberto no navegador: pacotes acima de 2 GB descomprimidos ou com stem acima de 300 MB são recusados (tetos do extrator).
- O visitante prepara a música inteira antes de tocar (mesmo caminho offline do culto).
