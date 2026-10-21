# Contrato do Worker de stems (F3) e do migrador (F5)

- **Status:** contrato de implementação, 2026-10-21. Complementa `spec-banco-online.md` (I5 e seu reforço) e o ADR-001.
- **Quem segue:** `workers/stems/` (Worker), `src/infrastructure/storage/R2WorkerStemStore.ts` (app) e `tools/migrator/` (migrador). Mudança aqui muda os três.

## 1. Recursos

| Recurso | Nome | Acesso |
|---|---|---|
| Bucket R2 | `lagoinha-vs-stems` (privado, sem domínio público, sem `r2.dev`) | só pelo binding `STEMS` do Worker |
| Banco D1 | `lagoinha-vs-stems-registry` | só pelo binding `REGISTRY` do Worker |
| Firestore | projeto `lagoinha-joao-pessoa`, banco `(default)` em `southamerica-east1` | o Worker lê **com o token do usuário** (as regras decidem); não tem conta de serviço |

O bucket `protocolo-vertice-assets` é de outro projeto e nunca é tocado.

**Separação de credenciais:** a identidade do usuário chega só pelo ID token do Firebase. O acesso ao R2 e ao D1 é credencial do backend (bindings do Worker), nunca exposta ao cliente. O Worker não tem credencial administrativa do Firestore; o bootstrap (igreja, primeiro admin, curadores) é feito por operação confiável fora do app (`tools/admin/`, com a credencial de dono do projeto no Firebase CLI). As regras dos clientes não são afrouxadas para o migrador: ele age como um usuário admin da igreja.

## 2. Chaves no R2

- Igreja: `churches/{churchId}/blobs/{sha256}`
- Catálogo global: `catalog/blobs/{sha256}`

`sha256` = 64 caracteres hex minúsculos do conteúdo. `churchId` = `^[a-z0-9-]{1,64}$`. A chave é **montada pelo Worker** a partir da rota já autorizada; o cliente nunca envia chave, escopo, classificação ou dono no corpo.

A mesma música em duas igrejas gera dois objetos: não há deduplicação entre igrejas (é isso que impede a reutilização cruzada pelo hash).

## 3. Autenticação

`Authorization: Bearer <Firebase ID token>`. O Worker valida:

- `alg` RS256, `kid` presente nas chaves públicas de `securetoken@system.gserviceaccount.com` (JWK: `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`, cache conforme `Cache-Control`);
- `iss` = `https://securetoken.google.com/{FIREBASE_PROJECT_ID}`, `aud` = `{FIREBASE_PROJECT_ID}`;
- `exp` no futuro e `iat` no passado (tolerância de 60 s), `sub` não vazio (= uid);
- `firebase.sign_in_provider` presente e diferente de `anonymous` (ausente tambem e recusado).

Falha de autenticação = `401` com `{"error":"unauthenticated"}`. Nunca há rota sem autenticação, exceto `GET /health`.

## 4. Autorização (lida no Firestore com o token do usuário)

| Ação | Precisa |
|---|---|
| Subir para a igreja `c` | `churches/c/members/{uid}` com `status == 'active'` e papel `sound_tech`, `leader` ou `admin` |
| Baixar da igreja `c` | ler `churches/c/library/{songId}/versions/{versionId}` (a regra exige membro ativo) **e** o `sha256` estar em `stems[].sha256` dessa versão **e** existir no D1 o registro `(scope='church:c', sha256)` |
| Subir para o catálogo | `platformAdmins/{uid}` existir (leitura permitida só ao próprio uid) |
| Baixar do catálogo | ler `catalog/{songId}/versions/{versionId}` **e** o hash listado **e** registro `(scope='catalog', sha256)` |
| Registrar origem / consultar estado | mesmo requisito de subir no escopo |

Negado = `403` `{"error":"forbidden"}`. Versão ou blob inexistente para quem tem permissão = `404`.

**Caso obrigatório:** um membro ativo das igrejas A e B que lista numa versão da A o `sha256` de um arquivo registrado só na B recebe `403` ao baixar pela A (o registro `church:A` não existe), mesmo podendo ler a versão.

## 5. Rotas

Base: `https://<worker>/v1`. `scope` na rota é `churches/{churchId}` ou `catalog`.

| Método e rota | Corpo | Resposta |
|---|---|---|
| `GET /health` | - | `200 {"ok":true,"version":"<git sha>"}` |
| `DELETE /{scope}/blobs/{sha256}` | - | `204`: remove objeto, registro e origens. Só admin da igreja (`members/{uid}` ativo com papel `admin`) ou curador no catálogo; `404` se não registrado; `409` se há escrita em curso |
| `HEAD /{scope}/blobs/{sha256}` | - | `200` se registrado no escopo (cabeçalhos `content-length`, `x-integrity`), `404` se não |
| `PUT /{scope}/blobs/{sha256}` | bytes (até 95 MB) | Grava com `sha256` em `R2PutOptions` (o R2 rejeita se o conteúdo não bater) e registra; `201` novo, `200` se já existia com `r2-sha256` (não regrava), `400 {"error":"sha256_mismatch"}`. Se o registro existente é `client-declared` (multipart), o PUT regrava, confere e promove para `r2-sha256` (`201`, `promoted:true`) |
| `POST /{scope}/blobs/{sha256}/multipart` | `{"size":n,"contentType":"..."}` (`size` 1 a 2 GiB; no máximo 3 uploads abertos por uid, `429 too_many_uploads`) | `201 {"uploadId":"..."}`; acima de 95 MB. `409 {"error":"already_exists"}` se o hash ja esta registrado no escopo (multipart nunca sobrescreve um blob existente) |
| `PUT /{scope}/blobs/{sha256}/multipart/{uploadId}/{partNumber}` | bytes da parte (5 MB a 95 MB, última menor) | `200 {"etag":"..."}`; `413 parts_exceed_size` se a soma das partes passar do `size` declarado |
| `POST /{scope}/blobs/{sha256}/multipart/{uploadId}/complete` | `{"parts":[{"partNumber":1,"etag":"..."}]}` | `201`; registra com `integrity='client-declared'`. `400 size_mismatch` (e o objeto e apagado) se o tamanho montado difere do `size` declarado na abertura |
| `DELETE /{scope}/blobs/{sha256}/multipart/{uploadId}` | - | `204` (aborta) |
| `GET /{scope}/blobs/{sha256}?song={songId}&version={versionId}` | - | bytes, `content-type` gravado, `etag`, `x-content-sha256`, `x-integrity`, aceita `Range` (`206`; `416` fora do arquivo). `Range` inválido, múltiplo ou insatisfazível = `416` com `content-range: bytes */size`; falha do R2 = `502`. Sempre com `content-disposition: attachment`, `x-content-type-options: nosniff` e CSP `sandbox` |
| `POST /{scope}/blobs/{sha256}/sources` | `{"kind":"drive","sourceId":"...","path":"...","name":"...","modifiedAt":"ISO","size":n,"md5":"..."}` | `201`; só se o blob já estiver registrado no escopo |

Cabeçalhos opcionais no `PUT`/`multipart`: `content-type` (gravado), `x-original-name` (gravado, até 255 caracteres).

Limites: o plano Workers Free aceita corpo de até 100 MB e 10 ms de CPU; o Worker não calcula hash (o R2 confere no `PUT`; no multipart quem baixa confere). `integrity`: `r2-sha256` (conferido pelo R2) ou `client-declared` (conferido por quem baixa).

CORS: só as origens de `ALLOWED_ORIGINS` (os dois Hostings do app em produção; `http://localhost:5173` só em desenvolvimento, via `--var`/`.dev.vars`, nunca no `wrangler.toml` publicado); métodos acima; `authorization`, `content-type`, `x-original-name`, `range`.

## 6. Registro de origem (D1, escrito só pelo Worker)

```sql
CREATE TABLE blobs (
  scope TEXT NOT NULL,            -- 'church:{id}' | 'catalog'
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_type TEXT,
  original_name TEXT,
  integrity TEXT NOT NULL,        -- 'r2-sha256' | 'client-declared'
  uploaded_by TEXT NOT NULL,      -- uid verificado no token
  uploaded_at TEXT NOT NULL,      -- ISO, relógio do Worker
  PRIMARY KEY (scope, sha256)
);
CREATE TABLE sources (
  scope TEXT NOT NULL, sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'drive' | 'app' | 'zip-entry'
  source_id TEXT NOT NULL,        -- id do arquivo no Drive, ou 'driveId!/caminho/no/zip'
  path TEXT, name TEXT, modified_at TEXT, size INTEGER, md5 TEXT,
  recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL,
  PRIMARY KEY (scope, sha256, kind, source_id)
);
CREATE TABLE uploads (
  upload_id TEXT PRIMARY KEY, scope TEXT NOT NULL, sha256 TEXT NOT NULL,
  uid TEXT NOT NULL, size INTEGER, content_type TEXT, created_at TEXT NOT NULL
);
```

O `complete` do multipart só aceita o `uploadId` aberto pelo mesmo `uid`, no mesmo escopo e hash.

## 7. Documentos que o app e o migrador gravam (pelas regras, como usuário)

`churches/{c}/library/{songId}`:

```
title, artist, kind ('song' | 'pad'), originalKey, bpm, timeSignature {beats, value}, durationSec,
tags [], rightsClass ('unknown' por padrão), currentVersionId (só depois de conferir os stems),
status ('ready' | 'pending'), pendingReason (texto, quando pending),
source {kind:'drive_migration', driveFileId, drivePath}, createdAt, updatedAt
```

`churches/{c}/library/{songId}/versions/{versionId}` (imutável):

```
createdAt, createdBy (uid), changelog, sections [{name, startSec, endSec}],
stems [{sha256, name, type (StemType), size, contentType}]
```

**Publicar um pacote** = gravar `currentVersionId` e `status:'ready'` só depois de: todos os stems obrigatórios com `HEAD 200` no escopo, `bpm` e `timeSignature` presentes, pelo menos um stem de áudio que não seja click nem guia. Falta algo = `status:'pending'` com `pendingReason`.

## 8. Testes que provam o contrato (pelo endpoint)

1. download permitido devolve os bytes com o mesmo `sha256`;
2. sem token = 401; token anônimo ou de outro projeto = 401;
3. usuário sem papel na igreja = 403 no download e no upload;
4. reutilização entre igrejas pelo hash = 403 (seção 4, caso obrigatório);
5. `PUT` com corpo que não bate com o hash = 400 e nada registrado;
6. upload simples, multipart (criar, partes, completar), registro de origem e `HEAD` funcionando;
7. o cliente não muda escopo, chave ou classificação: campos extras no corpo são ignorados e a chave vem da rota.

Ambiente de teste: Worker local (Miniflare/`@cloudflare/vitest-pool-workers`), Firestore Emulator com as `firestore.rules` do repo e chaves RS256 de teste servidas como JWKS só no ambiente de teste.

## 9. Endurecimentos da implementacao e riscos residuais (2026-10-21)

Acrescentados ao escrever o Worker; fazem parte do contrato.

- **Entrada do `PUT`/parte:** exige `content-length` (`411` sem ele), minimo 1 byte, maximo 95 MB (`413`). `x-original-name` com mais de 255 caracteres = `400`.
- **`content-type` gravado e servido:** so `tipo/subtipo` sem parametros; qualquer outra coisa vira `application/octet-stream`. No download o Worker nunca deixa o navegador interpretar o arquivo (`attachment`, `nosniff`, CSP `default-src 'none'; sandbox`), porque o tipo veio do cliente.
- **Multipart nao sobrescreve:** a abertura recusa hash ja registrado (`409`) e o `complete` reconfere antes de gravar. Sem isso, um tecnico poderia trocar por bytes arbitrarios um arquivo que o R2 tinha conferido (`r2-sha256`).
- **JWKS:** `kid` desconhecido so provoca nova busca a cada 60 s (evita amplificacao); indisponibilidade do JWKS = `503 auth_unavailable`, nunca aceita token sem validar.
- **Caminhos do Firestore:** `churchId` vem de `^[a-z0-9-]{1,64}$` e `song`/`version` de `^[A-Za-z0-9_-]{1,128}$`, para o parametro nunca virar outro caminho.

Riscos residuais conhecidos (nao tratados no Worker):

1. **Multipart e `client-declared`:** um tecnico/lider/admin da propria igreja pode registrar, por multipart, conteudo diferente do hash anunciado. O dano fica no escopo dele; quem baixa precisa conferir o sha256 (o app e o migrador devem).
2. **Revogacao:** o ID token vale ate 1 h; um membro removido continua passando na checagem de token, mas o Firestore (regras) nega a leitura/papel imediatamente, o que bloqueia todas as rotas.
3. **Sem limite de taxa nem cota por usuario.** Um tecnico mal-intencionado pode encher o bucket gratuito (10 GB). Mitigacao futura: Rate Limiting do Cloudflare e alerta de uso.
4. **Uploads multipart abandonados** ficam no R2 ate o ciclo de vida de 7 dias do proprio R2 e as linhas de `uploads` no D1 ate alguem abortar; limpar por job quando houver volume.

Acrescentos da revisão de segurança (commit ad41d6a):

- **Reserva de escrita por (escopo, hash):** `PUT`, `complete` do multipart e `DELETE` disputam uma linha em `reservations` (INSERT condicional; reserva com mais de 15 min é retomável). Quem perde recebe `409 in_progress`. Assim um `complete` com tamanho divergente nunca apaga objeto que outro acabou de conferir.
- **Pré-reserva de hash:** multipart `client-declared` pode ser sobrescrito pelo `PUT` verdadeiro (promoção), e um admin pode excluir o blob. O lixo não fica para sempre.
- **JSON** das rotas de multipart/origem: teto de 64 KB (`413`), conferido por `content-length` e pela contagem dos bytes lidos.
- **uid** do token só aceita `[A-Za-z0-9_.:@-]{1,128}` (nem `.` nem `..`) e vai codificado (`encodeURIComponent`) nos caminhos do Firestore.
- **JWKS:** buscas simultâneas coalescidas; se o Google falhar, a cópia vencida vale por até 10 min (depois, `503`).
- **Modo emulador de autenticação (só desenvolvimento):** aceita tokens `alg: "none"` do Firebase Auth Emulator **somente** se `FIREBASE_PROJECT_ID` começar com `demo-` **e** `AUTH_EMULATOR=true`. Iss/aud/exp/sub/provedor são validados igual; em qualquer outro projeto o modo é impossível mesmo com a variável. Nunca definir `AUTH_EMULATOR` no `wrangler.toml`.