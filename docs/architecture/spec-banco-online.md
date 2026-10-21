# Spec: Banco online do acervo e setlist do culto

- **Status:** Opcao C *decidida* (2026-10-21). **F0 e F1 entregues** (2026-10-21); F2-F6 pendentes. Decisao de provedor: `docs/architecture/ADR-001-banco-online-e-acervo.md` (Opcao C: Firebase Auth + Firestore + Cloudflare R2 via Worker).

### Estado da F0 (*validado*: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`)

- Dominio: `Membership` (papel por igreja) e `AccessPolicy` (regras da secao 4 e I4 como funcoes puras), `ServiceSetlist` + `SetlistConflictError`, `CloudSong.rightsClass/licenseRef` (padrao `unknown`).
- Portas: `AuthPort` (so identidade), `MembershipPort`, `SongLibraryPort` (com escopo; substitui `CloudVSRepositoryPort`), `StemBlobPort`, `SetlistRepositoryPort`, `DeviceCachePort`.
- Adaptadores locais: `LocalAuthAdapter` (o antigo `FirebaseAuthService`), `LocalSongLibraryAdapter`, `LocalStemStore`, `LocalSetlistRepository`, `IndexedDbDeviceCache`.
- Composition root: `src/presentation/composition.ts` + `BackendContext`, `VITE_BACKEND=local|firebase` (`firebase` recusa montar ate a F2).
- Testes de contrato em `tests/contract/` (a F2 acrescenta os adaptadores Firebase na mesma lista) e teste que falha se um componente der `new` em adaptador.
- Desvios conscientes: (1) `User` ainda guarda `role`/`churchId`; `Membership.fromLegacyUser` faz a ponte ate os membros virem do Firestore na F2. (2) I6 aplicado como "producao sem usuarios de exemplo nem admin automatico"; o adaptador local continua montando em producao porque ainda nao existe o Firebase (recusar agora deixaria o app publicado sem login). (3) A biblioteca da igreja no modo local fica em memoria (some ao recarregar), como o acervo de demonstracao ja ficava. Musica adicionada ao setlist pela biblioteca tambem nao e gravada no IndexedDB (comportamento anterior, mantido); so os uploads pela barra lateral sao. Gravar o setlist preparado no aparelho e o `PrepareServiceUseCase` da F4.
- **Legenda:** *proposto* = desenho; *decidido* = o Samuel confirmou; *validado* = existe teste/comando que passou.

---

### Estado da F1 (*validado*: `npm run test:rules`, 46 testes no emulador, mutacao de I1-I4 e da revisao derruba a suite)

- `firestore.rules` reescrito para o modelo da secao 3: papel em `churches/{id}/members/{uid}`, convite em `churches/{id}/invites/{sha256 do token}`, biblioteca e setlists dentro da igreja, catalogo global em `catalog/`, curadores em `platformAdmins/`. Colecoes antigas da raiz (`songs`, `setlists`, `invites`) ficam fechadas.
- Entrada por convite e um lote unico: o membro nasce `pending` com o `targetRole` e o `usedCount` sobe 1; um nao passa sem o outro (`getAfter`/`existsAfter`).
- Catalogo global legivel por quem e membro ativo da igreja apontada em `users/{uid}.primaryChurchId` (a regra confere o membro; apontar igreja alheia nao libera nada).
- `storage.rules`: so capas por igreja; stems ficam no R2 (ADR-001) e qualquer outro caminho e negado.
- Como rodar: `npm run test:rules` (sobe emuladores Firestore + Storage com projeto `demo-lagoinha-vs`, sem credencial). Exige Java 21+: o script usa o do PATH, `JAVA_HOME` ou `%LOCALAPPDATA%\Programs\jdk21`.
- Revisao de seguranca independente (`security-guardian`, 8 sondas no emulador): 1 alto, 3 medios e 6 baixos, nenhum critico e nenhum caminho para a I1. Corrigido nas regras, com teste de regressao: versao so sob musica existente (e no catalogo, so sob musica que passou pela I4); suspenso nao sai sozinho; rebaixar, suspender ou remover admin so pelo console (a igreja nunca fica sem admin pelo app); convite de quem deixou a lideranca deixa de valer; lider so revoga o proprio convite; id de convite precisa ser sha256 em hex; campos de membro, versao, biblioteca e igreja com chaves e tamanhos fixos; capa sem SVG. O alto restante (repasse de stems por hash) depende do Worker e virou reforco da I5 para a F3.
- Aceito por ora (baixo): uma pessoa pode esgotar um convite entrando e saindo repetidas vezes; qualquer conta logada le um convite cujo id (hash do token) conhece. Na F2: login anonimo desligado no projeto e App Check avaliado.- Ainda nao feito: deploy das regras (exige o projeto Firebase real, F2) e gate de deploy em CI.
---

## 1. O pedido, melhorado

Pedido original (Samuel): "o banco hoje esta no Google Drive mas deveria ser online da ferramenta, com acesso total e sincronizacao; as musicas do setlist devem vir desse banco, disponivel para quem tiver acesso ao aplicativo; e pode tambem dar acesso a um banco de VS local de determinada igreja".

Versao melhorada:

1. O Lagoinha VS passa a ter **um acervo online proprio** (sem depender do Google Drive), com login real e papeis por igreja; o Drive vira apenas uma forma de **importar** o que ja existe.
2. O acervo tem **duas prateleiras**: o **catalogo global** (musicas que a ferramenta tem direito de distribuir para todas as igrejas) e a **biblioteca privada de cada igreja** (o que aquela igreja comprou ou gravou, visivel so para os membros dela).
3. O **lider monta o setlist do culto na nuvem** escolhendo musicas das duas prateleiras; todos os aparelhos da igreja veem o mesmo setlist atualizado.
4. Antes do culto, o aparelho do palco executa **"Preparar culto"**: baixa e confere todas as musicas do setlist; durante o culto **nada depende de internet**.
5. Entrar na igreja e por **convite ou aprovacao** de um lider/admin daquela igreja; ninguem se promove pelo aplicativo. Musicas compradas de terceiros (MultiTracks, Loop Community etc.) **nunca** vao para o catalogo global.

## 2. Escopo

**Dentro:** modelo de dados, acesso, sincronizacao offline-first, portas/adaptadores, migracao em fases.
**Fora (outras decisoes):** formato de entrega comprimido dos stems (FLAC/AAC — e a maior alavanca de capacidade do IndexedDB e merece ADR proprio), cobranca/assinatura, loja de multitracks, transmissao.

## 3. Modelo de dados (Firestore + R2) — proposto

Colecoes (caminhos Firestore). `*` = imutavel depois de criado.

```
platformAdmins/{uid}                       # curadores do catalogo global (definidos fora do app; caminho corrigido na F1: platform/admins/{uid} tinha numero impar de segmentos)

churches/{churchId}
  name, city, createdAt, createdBy
  members/{uid}                            # papel POR igreja (um usuario pode servir em duas igrejas)
    role: 'admin' | 'leader' | 'sound_tech' | 'musician'
    status: 'pending' | 'active' | 'suspended'
    instrument?, approvedBy?, approvedAt?
  invites/{inviteId}
    tokenHash (sha256 do token; o token em claro so existe no link), targetRole,
    expiresAt, maxUses, usedCount, createdBy, revoked
  library/{songId}                         # biblioteca PRIVADA da igreja
    (mesmos campos de Song abaixo) + rightsClass
    versions/{versionId}*                  # manifesto imutavel
  setlists/{setlistId}                     # culto/ensaio
    title, serviceDate, status: 'draft'|'published'|'locked'
    revision (inteiro, sobe a cada escrita), updatedBy, updatedAt
    items: [{ order, source: 'global'|'church', songId, versionId, keyOverride?, bpmOverride?, notes? }]

catalog/{songId}                           # CATALOGO GLOBAL (leitura para qualquer membro ativo de qualquer igreja)
  title, artist, originalKey, bpm, timeSignature, tags, durationSec
  rightsClass: 'own' | 'licensed_redistributable'
  licenseRef: { holder, documentId, scope, validUntil? }   # obrigatorio
  currentVersionId
  versions/{versionId}*
    createdAt, createdBy, changelog
    sections[] (mapa de secoes/cues para pulos quantizados)
    stems: [{ stemId, name, role: 'click'|'guide'|'band'|'pad'|..., output: 'IEM'|'FOH',
              sha256, bytes, mime, durationSec }]

users/{uid}                                # perfil (nome, foto). SEM role e SEM churchId aqui.
```

Arquivos (R2, bucket privado): `stems/{sha256}` — chave por conteudo, imutavel. O banco guarda so o `sha256`; o mesmo arquivo nunca e duplicado e o aparelho confere integridade ao baixar.

**rightsClass** (o campo que separa licenciamento):

| Valor | Significa | Onde pode morar |
|---|---|---|
| `own` | Gravacao/arranjo da propria Lagoinha ou da ferramenta, com titularidade documentada | catalogo global ou biblioteca |
| `licensed_redistributable` | Contrato que autoriza distribuir a todas as igrejas do app | catalogo global ou biblioteca |
| `church_purchased` | Comprada por uma igreja com licenca congregacional (caso tipico MultiTracks/Loop) | **so** na biblioteca daquela igreja |
| `unknown` | Origem nao documentada (padrao de toda importacao do Drive) | **so** na biblioteca; nunca promovida |

Promover da biblioteca para o catalogo exige curador global + `licenseRef` preenchido; regra impede `church_purchased`/`unknown` em `catalog/`.

**Versoes:** editar stems, secoes ou cues cria `versions/{novo}`; versoes antigas nao mudam. O setlist aponta para `versionId` explicito: o culto de domingo toca exatamente o que foi ensaiado, mesmo que alguem publique versao nova no sabado.

Mudanca no dominio (`src/domain`): `User` perde `role`/`churchId` fixos e o default `'lagoinha-jp'` (`User.ts:40`); nasce `Membership { churchId, uid, role, status }`. `CloudSong` ganha `rightsClass`, `versionId` e `sha256` por stem. Regras de permissao continuam como funcoes puras de dominio (testaveis), espelhando as regras do servidor — o cliente **exibe** permissao, o servidor **decide**.

## 4. Modelo de acesso — proposto

| Acao | musician | sound_tech | leader | admin (da igreja) | curador global |
|---|---|---|---|---|---|
| Ler catalogo global | sim (se membro ativo de alguma igreja) | sim | sim | sim | sim |
| Ler biblioteca/setlists da propria igreja | sim | sim | sim | sim | nao (salvo se membro) |
| Baixar stems | os que o setlist/biblioteca/catalogo permitem | idem | idem | idem | idem |
| Subir musica na biblioteca da igreja | nao | sim | sim | sim | — |
| Criar/editar setlist | nao | nao | sim | sim | — |
| Aprovar membro, trocar papel, convidar | nao | nao | convidar ate `musician`/`sound_tech` | sim (ate `leader`; `admin` so por outro admin) | — |
| Escrever no catalogo global | nao | nao | nao | nao | sim |

Invariantes (cada uma vira teste de regra que pode falhar):
- **I1** Ninguem altera o proprio `role`/`status` (nem cria o proprio `members/{uid}` como `active`). Auto-cadastro so cria `status: 'pending'` via convite valido.
- **I2** Igreja A nunca le nada de `churches/B/**`.
- **I3** Consumo de convite so incrementa `usedCount` em 1, so se `!revoked`, `usedCount < maxUses`, `now < expiresAt`, e cria membro `pending` com o `targetRole` do convite (aprovacao final so por admin, como na tabela acima; lider apenas convida). Corrige o `firestore.rules` atual, que permite qualquer autenticado incrementar `usedCount` sem checar validade.
- **I4** `catalog/**` so recebe escrita de `platformAdmins/{uid}` existente; `rightsClass` em `catalog/` so `own` ou `licensed_redistributable` com `licenseRef`.
- **I5** O Worker de stems nao tem regra propria: so entrega `stems/{sha256}` se o usuario conseguir ler, **com o proprio token**, um documento de versao (catalogo ou biblioteca da igreja dele) que liste aquele `sha256`.
  - **Reforco (revisao de seguranca da F1):** ler a versao nao basta. Um tecnico pode listar numa versao da igreja A o `sha256` de um arquivo comprado pela igreja B, e a regra nao percorre a lista de stems. O Worker grava no upload o registro `churches/{id}/blobs/{sha256}` (cliente sem escrita) e no download so entrega se o hash estiver registrado na igreja do pedido ou referenciado pelo catalogo. Obrigatorio na F3.
- **I6** Build de producao recusa o adaptador de auth local (sem admin automatico fora do modo `local`).

Curador global: no inicio, so o Samuel (ou quem ele indicar), cadastrado manualmente no console do Firebase — nao existe tela que crie curador.

## 5. Sincronizacao offline-first — proposto

Principio: **a nuvem e onde se prepara; o aparelho e onde se toca.** O IndexedDB (`audio_blobs`, `songs`, `setlists`) continua sendo a unica fonte durante o play; `navigator.storage.persist()` continua obrigatorio (ENG-01).

1. **Navegar/montar (online):** catalogo, biblioteca e setlists vem do Firestore; cache local de metadados do proprio SDK.
2. **Preparar culto (online, antes do culto):** `PrepareServiceUseCase(setlistId)` congela uma copia do setlist (`revision` N), baixa manifestos das versoes, baixa so os stems cujo `sha256` ainda nao esta no aparelho, confere `sha256` e grava no IndexedDB. Resultado: `100% pronto` ou lista do que falta. Reaproveita `verifySongOfflineReadiness`.
3. **Modo culto (offline por desenho):** o player le so o snapshot local. Se a rede cair ou nunca existir, nada muda. Alteracao remota no setlist durante o culto vira aviso discreto ("o lider alterou o setlist — aplicar depois desta musica?"), **nunca** aplicada sozinha no meio de uma musica.
4. **Conflitos:**
   - Musicas e versoes: imutaveis -> sem conflito.
   - Setlist: escrita condicional por `revision` (transacao: grava so se `revision` no servidor == a lida; senao "setlist alterado por Fulano, recarregue"). Sem merge automatico — lista de 6-10 musicas e facil de reconferir, e merge silencioso e o pior erro possivel no palco.
   - Aparelho offline que editou setlist: edicao fica pendente e passa pela mesma checagem de `revision` ao voltar.
5. **Limpeza de cache:** remover stems nao referenciados por setlists futuros/fixados, so por acao do usuario ou com folga de quota; nunca durante o modo culto.

Risco de capacidade: 6 musicas x 1,3 GB = ~8 GB no IndexedDB do aparelho. Cota do navegador (em especial Safari/iPad) pode nao comportar — ver Riscos; formato comprimido e a mitigacao (ADR futuro).

## 6. "Banco de VS local da igreja": faz sentido?

Avaliacao franca das tres leituras possiveis:

| Leitura | Faz sentido? | Recomendacao |
|---|---|---|
| **Biblioteca privada da igreja na nuvem** (o acervo comprado/gravado por aquela igreja, so para os membros dela) | **Sim — e o caso principal.** E o que permite usar VS comprado sem violar licenca e coincide com a posicao anterior do projeto (doc 06: nuvem como backup privado por congregacao) | Fases 1-4 |
| **Cache offline do aparelho** (copia local das musicas do culto) | **Sim, obrigatorio** — mas nao e um "banco", e uma copia descartavel do que esta na nuvem | Ja existe (IndexedDB); Fase 4 formaliza |
| **Pasta local/rede da igreja** (HD, pendrive, NAS) lida pelo navegador via File System Access API | **Parcialmente.** Util para igreja que ja tem acervo em HD e nao quer subir tudo. Limites: `showDirectoryPicker` so em navegadores Chromium (nao Safari/iPad — **NAO VERIFICADO nesta rodada**), permissao repedida por sessao, e tocar direto do NAS reintroduz dependencia de rede no palco | Fase 6 opcional, **so como importacao** para o IndexedDB/biblioteca, nunca como fonte durante o play |

Descartado: servidor proprio rodando na igreja (custo operacional maior que o ganho; ver ADR secao 5).

## 7. Licenciamento: o que "disponivel para quem tiver acesso" pode significar

- Multitracks comerciais (MultiTracks.com, Loop Community e similares) em geral sao licenciadas **para a congregacao compradora**; redistribuir para outras igrejas do app tende a violar os termos (o doc 06 do projeto ja registrou isso para a MultiTracks). **Isto nao e parecer juridico**: a leitura dos contratos especificos e do Samuel/assessoria.
- Consequencia de desenho: "disponivel para todos" vale **so para o catalogo global**, que aceita apenas `own` e `licensed_redistributable` com documento de licenca. Todo o resto mora na biblioteca da igreja que comprou.
- Toda importacao do Google Drive entra como `unknown` na biblioteca da Lagoinha JP; promover exige curador + documento.
- O valor do catalogo global depende de **conteudo proprio** (gravacoes e arranjos da Lagoinha, artistas parceiros com contrato). Isso e decisao de negocio do Samuel, nao de tecnologia.

## 8. Portas e adaptadores — proposto

Hoje em `src/application/ports`: `AuthPort`, `CloudVSRepositoryPort`, `GoogleDriveStoragePort`, `AudioEnginePort`.

| Porta | Situacao | Adaptador local (Zero-Blocker, sem credencial) | Adaptador producao (`.env`) |
|---|---|---|---|
| `AuthPort` | **muda**: so identidade (sign-in Google/e-mail, sign-out, usuario atual, `onAuthStateChanged`) | `LocalAuthAdapter` = o atual `FirebaseAuthService` renomeado (o nome atual engana), com usuarios mock `admin`/`user`, **bloqueado em build de producao** (I6) | `FirebaseAuthAdapter` (SDK Firebase Auth) |
| `MembershipPort` | **nasce**, recebendo de `AuthPort` aprovar/rejeitar/trocar papel/convites/listar membros — sao operacoes de banco, nao de identidade | `LocalMembershipAdapter` (IndexedDB/memoria) | `FirestoreMembershipAdapter` |
| `SongLibraryPort` | **evolui** de `CloudVSRepositoryPort`: `list/search/getVersion/upload` com parametro `scope: {kind:'global'} \| {kind:'church', churchId}` | `DemoCloudVSLibrary` + IndexedDB como semente/local | `FirestoreSongLibraryAdapter` |
| `StemBlobPort` | **nasce**: `get(sha256): Blob`, `put(file): sha256` | `LocalStemStore` (IndexedDB/memoria) | `R2WorkerStemStore` (HTTP ao Worker com ID token) |
| `SetlistRepositoryPort` | **nasce**: setlists por igreja com `revision` | IndexedDB (store `setlists` atual) | `FirestoreSetlistAdapter` |
| `DeviceCachePort` | **nasce** como fachada fina do `IndexedDbStorageService` (hoje classe estatica chamada direto) para o `PrepareServiceUseCase` ser testavel | `IndexedDbStorageService` | o mesmo (o aparelho e sempre local) |
| `GoogleDriveStoragePort` | **rebaixada** a fonte de importacao (Fase 5); depois aposentar | fallback simulado atual | `GoogleDriveStorageService` |

Por que **uma** `SongLibraryPort` com escopo, e nao `SongCatalogPort` + `ChurchLibraryPort`: as duas teriam as mesmas operacoes e o mesmo formato; muda so o caminho e a regra no servidor. Separar so se surgir operacao exclusiva de um lado (ex.: compra no catalogo).

**Composition root:** hoje `CloudVSLibraryModal.tsx` e `App.tsx` dao `new` em adaptadores. Proposto: um unico ponto de montagem (ex.: `src/presentation/composition.ts`) escolhendo adaptadores por `VITE_BACKEND=local|firebase`; componentes recebem portas por contexto/props. Segredos do R2 ficam **so** no Worker (Wrangler secret); o app so conhece a URL do Worker e a config publica do Firebase.

Worker (fora de `src/`, ex.: `workers/stems/`): `GET /stems/:sha256?ref=<caminho da versao>` -> valida ID token Firebase -> le o documento de versao no Firestore REST com o token do usuario -> confere que o `sha256` esta listado -> devolve o objeto do R2. `PUT` analogo exigindo papel de upload (lido do `members/{uid}` com o token).

## 9. Plano de migracao em fases (cada fase com verificacao que pode falhar)

Comandos `npm test`, `npm run typecheck`, `npm run build` existem hoje (AGENTS.md). Scripts marcados *(novo)* serao criados na fase.

| Fase | Entrega | Verificacao | Precisa do Samuel? |
|---|---|---|---|
| **F0 Fundacao local** | Portas novas/alteradas, adaptadores locais, `Membership` no dominio, composition root, `VITE_BACKEND=local`; testes de contrato das portas rodando contra os adaptadores locais | `npm test` e `npm run typecheck` verdes; teste que **falha** se `LocalAuthAdapter` entrar em build de producao; teste de dominio: musico nao aprova membro; `grep "new .*Adapter\|new .*Service" src/presentation/components` vazio | Nao |
| **F1 Regras + emulador** | `firestore.rules` reescrito para o modelo da secao 3 (I1-I4); suite de regras | *(novo)* `npm run test:rules` via Firebase Emulator (exige Firebase CLI; requisito de Java do emulador **NAO VERIFICADO**) com casos negativos: auto-promocao negada, leitura cruzada A->B negada, convite expirado negado, `church_purchased` em `catalog/` negado | Nao |
| **F2 Auth e membros reais** | `FirebaseAuthAdapter`, `FirestoreMembershipAdapter`, tela de convite/aprovacao | Emulador: fluxo convite -> pending -> aprovado; em projeto real: login Google do Samuel aparece em `members` como `admin` (bootstrap manual) | **Sim**: confirmar/criar projeto Firebase (ha `firebase.json` com site `lagoinha-vs-jp`; existencia do projeto **NAO VERIFICADA**), ativar provedor Google, cadastrar-se como primeiro admin e curador |
| **F3 Spike + stems em R2** | Spike do Worker (condicoes do ADR secao 7) e depois `R2WorkerStemStore`, upload pela biblioteca | Script *(novo)* sobe stem de 150 MB, baixa pelo Worker e compara `sha256`; requisicao sem token = 401; token de outra igreja = 403; tempo/CPU medidos no `wrangler dev` e no painel | **Sim**: conta Cloudflare, bucket R2 (provavel cadastro de meio de pagamento), digitar segredos via `wrangler secret` |
| **F4 Setlist na nuvem + Preparar culto** | `FirestoreSetlistAdapter`, `PrepareServiceUseCase`, modo culto com snapshot | Teste de conflito por `revision` (segunda escrita com revision velha falha); teste E2E com contexto offline (Playwright `setOffline`) tocando o setlist preparado inteiro; readiness = 100% | Nao (ensaio de bancada com o tecnico de som e recomendado) |
| **F5 Migrar do Drive** | Importador unidirecional Drive -> biblioteca da Lagoinha JP, `rightsClass: 'unknown'` | Relatorio: n musicas no Drive = n importadas; `sha256` conferido; nenhuma em `catalog/` | **Sim**: decidir quais musicas tem titularidade para promover ao catalogo (e com qual documento) |
| **F6 (opcional) Importar pasta local** | File System Access API -> biblioteca/IndexedDB | Importa pasta de teste com 1 musica e 13 stems; em navegador sem suporte a opcao some (teste de feature detection) | Nao |

## 10. Decisoes e acoes que sao do Samuel

1. **Aprovar a Opcao C** do ADR (ou pedir D, se preferir Postgres/menos lock-in pagando ~$25/mes fixos).
2. **Contas e cartao:** projeto Firebase (plano Spark basta nesta arquitetura) e conta Cloudflare com R2. Ele faz login e digita os segredos; nenhum agente pede senha.
3. **Negocio/direitos:** quem e curador do catalogo global; quais musicas sao `own`/`licensed_redistributable` e com qual documento; se o ensaio em casa usa stems completos ou so uma mixagem guia.
4. **Quem e o primeiro admin** da Lagoinha JP (hoje o codigo assume "Leandro Machado" como admin automatico — isso sai).

## 11. Riscos

| Risco | Efeito | Mitigacao |
|---|---|---|
| Cota de IndexedDB insuficiente (~8 GB por culto em WAV) | Preparar culto falha em tablet | Medir na F4 com `navigator.storage.estimate()`; ADR de formato comprimido; preparar so o culto da semana |
| Worker Free nao aguenta stream de 150 MB / validacao JWT | F3 bloqueada | Worker Paid ($5/mes) ou URL pre-assinada curta; ultimo caso, Opcao D |
| Regras escritas erradas | Vazamento entre igrejas | Suite de regras negativa na F1 como gate de deploy; revisao do `security-guardian` |
| Musica licenciada parar no catalogo global | Risco juridico | `rightsClass` validado nas regras; importacao padrao `unknown`; promocao so por curador |
| Leituras Firestore > 50K/dia com muitas igrejas | Erro de cota no Spark | Monitorar; Blaze pay-as-you-go quando passar de ~5 igrejas ativas |
| Dois provedores | Duas contas, dois pontos de falha na preparacao | Falha de nuvem afeta so a preparacao, nunca o culto (offline por desenho) |
