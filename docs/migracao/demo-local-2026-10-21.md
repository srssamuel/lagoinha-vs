# Demo local ponta a ponta do acervo migrado (2026-10-21)

- **O que prova:** o fluxo do acervo migrado, do migrador ao palco offline, 100% local (emuladores do Firebase, Worker em `wrangler dev` com D1/R2 locais, Vite). Nada de nuvem real: projeto `demo-lagoinha`, sem Firebase `lagoinha-joao-pessoa`, sem D1/R2 remotos.
- **Como rodar:** `npm run demo:e2e` (ou `node --no-warnings scripts/demo-e2e.mjs`). Sobe tudo, roda o roteiro e derruba os processos no `finally`. Pré-requisitos: Java 21 (`%LOCALAPPDATA%\Programs\jdk21` ou `JAVA_HOME`), o piloto local do migrador feito (manifesto em `%LOCALAPPDATA%\lagoinha-vs\migracao`), `playwright` global (`npm root -g`) e as portas 8080, 9099, 8788 e 5199 livres.
- **Evidências (fora do git):** `%LOCALAPPDATA%\lagoinha-vs\demo\evidencias\` (screenshots e `resultado.json`) e os logs de cada processo em `%LOCALAPPDATA%\lagoinha-vs\demo\`. Os nomes de músicas aparecem só ali; este documento só tem contagens.
- **Ambiente do app:** variáveis `VITE_*` passadas ao processo do Vite (`--mode demo`), sem criar nem ler `.env`/`.env.local`.
- **Drive:** só leitura. O migrador lê os arquivos do piloto em `G:`; o manifesto usado é uma **cópia** (`demo\migracao\manifest.db`) com os itens do piloto reabertos, então o manifesto original não muda.

## Resultado por passo (última execução: 11 PASS, 0 FAIL, código de saída 0)

| Passo | Resultado | Evidência (contagens) |
|---|---|---|
| 1. Emuladores auth+firestore, Worker `dev:emu`, Vite | PASS | portas abriram; Worker responde 401 sem token (esperado); Vite serve o app |
| 2. Semeadura: igreja `lagoinha-jp`, admin e integrante | PASS | 2 membros ativos (`admin`, `musician`) lidos de volta |
| 3. Migrador `--target worker --registry firestore` no piloto | PASS | 31 itens processados, 31 hasheados, 30 enviados (~101 MB), 31 verificados, 0 falhas; 3 músicas publicadas (1 pasta, 1 zip, 1 pad); Firestore: 6 escritas de música e 3 versões criadas; 30 blobs conferidos por HEAD no Worker com o tamanho do registro |
| 4. Admin: login, biblioteca vinda do Firestore, adiciona via Worker, publica o culto | PASS | 3 músicas na biblioteca; 2 adicionadas; 29 downloads pelo Worker, todos HTTP 200; culto no Firestore com 2 itens, revisão 1, `published` |
| 5. Integrante: abre o culto, "Preparar e abrir offline", toca | PASS | repertório com 2 músicas; mixer com 10 e 19 canais; 2 músicas e 29 áudios no IndexedDB; botão virou PAUSAR e continuou 2,5 s depois |
| 6. Offline (`context.setOffline(true)`) + recarregar | PASS | `navigator.onLine=false`; 2 músicas abertas do IndexedDB, tocaram; 0 pedidos ao Worker depois de cortar a rede |
| 7. Versão nova da mesma música | PASS | versão nova com 9 stems (a antiga tem 10) criada pelo `FirestoreRegistry` do migrador; acervo aponta para a nova; o culto continua na antiga (revisão 1); a versão antiga segue no aparelho e a nova não desce sozinha; preparar de novo mantém a antiga; adicionar do acervo traz a nova e as duas coexistem (3 chaves) |
| 8. Sessão limpa com Drive bloqueado (passos 4-6 repetidos) | PASS | rotas bloqueando `*.googleapis.com/drive*`, `drive.google.com`, `*.googleusercontent.com`, `docs.google.com`: 0 pedidos ao Drive nas duas sessões (admin 271 pedidos, integrante 399, só hosts locais); fluxo completo funcionou |

## Defeitos achados e corrigidos

1. **Música migrada em mp3/m4a não tocava.** O migrador só mede duração de WAV; sem `durationSec`, o app montava `Song.duration = 0` e o motor encerrava a música no instante 0 (o botão voltava a "DAR PLAY"). Correção no app: `probeAudioDuration` (cabeçalho do áudio, sem decodificar) preenche a duração quando o registro não tem, em `FirestoreSongLibraryAdapter.toPlaybackSong`. O contrato do motor não mudou. Teste: `tests/unit/probeAudioDuration.test.ts`.
2. **O app não abria offline.** Ao recarregar sem rede, a leitura do membro no Firestore falhava e o app caía na tela de login. Correção: `FirebaseAccountService` guarda o último papel conhecido da conta (`localStorage`, chave por uid) e só o usa quando o Firestore responde `unavailable`; online o Firestore sempre manda e as regras (e o Worker) seguem decidindo o acesso. Teste: `tests/firebase/firebaseAdapters.test.ts` (emulador, rede desligada com `disableNetwork`).
3. **Migrador contra emulador.** O registro Firestore só falava com `firestore.googleapis.com`. Novo `MIGRATOR_FIRESTORE_BASE` (ex.: `http://127.0.0.1:8080`); o padrão continua o Firestore real. Teste em `tools/migrator/test/unit.test.mjs`. Os alvos `worker` e `firestore` não precisaram de outra correção contra a rede real.

## Limitações honestas

- **App shell offline:** o app não tem service worker. O passo 6 corta a rede de verdade (`setOffline`), mas serve HTML/JS do Vite a partir de um cache do próprio runner. Provado: dados e áudio vêm do IndexedDB. Não provado: instalar/abrir o app sem rede num aparelho real (depende de PWA, fora do escopo).
- **Offline = sessão já aberta antes:** a conta precisa ter entrado online uma vez no aparelho (Firebase Auth e o papel lembrado ficam no navegador).
- **Papel lembrado só abre a interface:** quem foi suspenso e abre offline continua vendo a interface até voltar online; os dados em nuvem seguem protegidos pelas regras e pelo Worker.
- **Emuladores, não produção:** token de Auth sem assinatura (alg none) só aceito pelo Worker em projeto `demo-*`; R2/D1 locais do Miniflare; Firestore Emulator, não o serviço. Nada disso mede latência, cota ou custo reais.
- **Piloto, não o acervo todo:** 3 músicas e 31 itens (~101 MB). Volume, retomada longa e arquivos grandes (multipart de 50 MB) seguem cobertos só por teste com fetch simulado.
- **Músicas migradas sem mapa de seções** (`sections: []`): tocam, mas a barra de seções fica vazia; precisa de edição na biblioteca.
- **Compasso assumido:** o piloto usou `--assume-time-signature 4/4` para as músicas ficarem prontas; o registro marca `timeSignatureSource: assumed`.
- **Prova de "tocar" é de estado, não de som:** o runner confere que o player entrou e ficou em reprodução (headless não mede saída de áudio).
- **Passo 8:** o bloqueio vale para o navegador; o migrador lê `G:` pelo sistema de arquivos (não usa API do Drive) e o Drive não foi escrito.
- **Concorrência no emulador:** páginas deixadas abertas seguram canais de escuta e deixaram o emulador lento a ponto de o Worker responder 502 (timeout de 8 s). O runner fecha as sessões que já cumpriram o papel.
