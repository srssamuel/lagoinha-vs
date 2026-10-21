# Migrador do acervo (Drive para o banco online)

## Sessão para nuvem real

O Worker de stems e o Firestore exigem um Firebase ID token (1 h de validade). O script `tools/admin/migrator-session.mjs` mantém esse token fresco durante a migração longa:

1. `node tools/admin/migrator-session.mjs login` abre `http://localhost:<porta>` (a partir de 5180); o dono clica em "Entrar com Google" (sem acesso ao Drive). Grava `%LOCALAPPDATA%\lagoinha-vs\migracao\session.json` (refresh token, uid, e-mail, apiKey) e imprime só uid e e-mail.
2. `node tools/admin/migrator-session.mjs refresh --loop` troca o refresh token por ID token a cada 45 min em `...\migracao\id-token.txt` (Ctrl-C encerra; falha de rede tenta de novo com backoff). Sem `--loop`, renova uma vez.
3. Aponte o migrador para o arquivo: `$env:MIGRATOR_ID_TOKEN_FILE = "$env:LOCALAPPDATA\lagoinha-vs\migracao\id-token.txt"` (relido a cada requisição).

Os dois arquivos ficam com ACL só do usuário atual e nunca vão para o git nem para o log. A apiKey web vem do `firebase apps:sdkconfig` na hora do `login`. Se o refresh token for revogado, repita o `login`. Testes: `node --test tools/admin/test/migrator-session.test.mjs`.
