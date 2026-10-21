# Worker de stems (Lagoinha VS)

Cloudflare Worker que guarda os stems no R2 (`lagoinha-vs-stems`) e o registro de origem no D1 (`lagoinha-vs-stems-registry`).
Quem manda e o contrato: `docs/architecture/contrato-stems-worker.md` (rotas, chaves, autorizacao, schema, testes).
A identidade e o papel vem do ID token do Firebase; a autorizacao e lida no Firestore **com o token do usuario**, entao
`firestore.rules` decide. O Worker nao tem credencial administrativa.

## Testar

```powershell
cd workers/stems
npm install
npm run typecheck     # tsc --noEmit
npm test              # sem emulador: autenticacao, CORS, roteamento, conversao Firestore (os testes de contrato ficam "skipped")
npm run test:emu      # sobe o Firestore Emulator (porta 8080, regras reais da raiz) e roda TUDO, incluindo a secao 8 do contrato
```

`test:emu` precisa de Java 21+ (usa o do PATH, `JAVA_HOME` ou `%LOCALAPPDATA%\Programs\jdk21`) e roda a partir da raiz do repo
(`firebase-tools` e dependencia da raiz). Nao use `| Select-Object -First N` na saida: fechar o pipe antes do fim deixa o
emulador orfao na porta 8080.

Como os testes funcionam: o Worker roda no workerd local (`@cloudflare/vitest-plugin`), com R2 e D1 em memoria. As chaves
RS256 sao geradas no teste e o JWKS e servido por um `fetch` interceptado no host ficticio `jwks.test` (so o `JWKS_URL` dos
testes aponta para la; o codigo de producao nao tem desvio). O Firestore real do emulador e alcancado direto em
`127.0.0.1:8080` (o workerd local tem rede de saida). O emulador aceita JWT sem validar assinatura; o estado e preparado
por REST com `Authorization: Bearer owner`.

## Publicar (exige `wrangler login` do dono da conta Cloudflare)

```powershell
cd workers/stems
npx wrangler login
npx wrangler d1 create lagoinha-vs-stems-registry          # copie o database_id para wrangler.toml (TO_FILL_AFTER_D1_CREATE)
npx wrangler d1 migrations apply lagoinha-vs-stems-registry --remote
npx wrangler deploy --var VERSION:$(git rev-parse --short HEAD)
```

Depois: `WORKER_URL=... TOKEN_FILE=... CHURCH_ID=... node scripts/smoke.mjs` (veja o cabecalho do script; gera um arquivo
de 120 MB em pasta temporaria e apaga no fim). Se o dominio do app mudar, ajuste `ALLOWED_ORIGINS` em `wrangler.toml`.
O bucket `lagoinha-vs-stems` deve continuar privado, sem dominio publico nem `r2.dev`.

## Limites do plano Free

- Workers: corpo de requisicao ate 100 MB (por isso o `PUT` simples aceita ate 95 MB e arquivos maiores vao por multipart),
  10 ms de CPU por requisicao (o Worker so repassa streams e confere JWT; nao calcula hash), 100 mil requisicoes/dia.
- R2: 10 GB, 1 milhao de operacoes de escrita (classe A) e 10 milhoes de leitura (classe B) por mes; sem custo de saida.
  Partes de multipart: minimo 5 MB (exceto a ultima), ate 10 mil partes. Multipart incompleto e abortado pelo R2 em 7 dias.
- D1: 5 GB, 5 milhoes de leituras e 100 mil escritas por dia.
- Cada operacao faz 1 leitura de documento no Firestore (mais as que as regras fazem com get()): conta na cota gratuita do Firestore.

Valores do plano mudam; confira a pagina de limites da Cloudflare antes de depender deles.
