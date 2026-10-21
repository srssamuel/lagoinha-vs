# ADR-001 (arquitetura): Banco online do acervo de VS (metadados + stems)

- **Status:** proposto (recomendacao do Principal Architect; vira "aceito" quando o Samuel criar as contas da Fase 2/3 e o spike F3 passar)
- **Data:** 2026-10-20
- **Decisores:** Samuel Rosa (dono do produto), Principal Architect
- **Consultados:** Security Guardian (regras/isolamento), QA (testes de regras e offline) — ainda nao consultados formalmente
- **Numeracao:** serie local de `docs/architecture/`. Nao confundir com `docs/adr/ADR-001-baseline.md` (decisao de stack do player).
- **Spec relacionada:** `docs/architecture/spec-banco-online.md`

---

## 1. Contexto e declaracao do problema

Hoje (verificado no codigo em 2026-10-20):

- **Acervo** vem de uma pasta do Google Drive (`src/infrastructure/storage/GoogleDriveStorageService.ts`, com fallback de musicas simuladas) e de ZIPs importados (`ZipMultitrackExtractor`). As musicas importadas ficam so no IndexedDB do aparelho (`IndexedDbStorageService`, `DB_VERSION = 2`, stores `songs`, `setlists`, `audio_blobs`).
- **Setlist** = presets `DemoWorshipSongs` + musicas salvas no IndexedDB (`useSetlist.ts`, `setlistReducer.ts`). Nada e compartilhado entre aparelhos.
- **Auth** (`FirebaseAuthService.ts`) e um adaptador local em `localStorage`: nao verifica senha de fato, entra como admin por padrao (`admin-leandro-machado`), papel e `churchId` vem do `localStorage`. `User.churchId` cai em `'lagoinha-jp'` quando ausente (`User.ts:40`). Nao ha SDK Firebase importado em `src/`.
- `CloudVSLibraryModal.tsx` instancia `DemoCloudVSLibrary` e `GoogleDriveStorageService` direto (camada de apresentacao conhecendo infraestrutura; nao ha composition root).
- Existem `firebase.json` (Hosting de `dist`), `firestore.rules` e `storage.rules` (modelo "um usuario = uma igreja", sem catalogo global, consumo de convite aberto a qualquer autenticado).

O Samuel quer um **banco online da propria ferramenta**, com acesso e sincronizacao, de onde o setlist puxe as musicas, disponivel para quem tem acesso ao app, e possivelmente um "banco de VS local da igreja".

O problema tecnico central nao e o banco de metadados (pequeno) e sim **os arquivos de audio**: ~13 stems x 50-150 MB por musica = **0,65 a 1,95 GB por musica** (media usada: 1,3 GB). O custo e o risco dominantes sao armazenamento e, principalmente, **download (egress)** desses arquivos — e a garantia de que nada disso dependa de rede durante o culto.

## 2. Drivers de decisao

1. **Offline no palco (inegociavel):** o play nunca depende de rede; o IndexedDB continua sendo a fonte durante o culto (ENG-01).
2. **Custo mensal previsivel**, sobretudo com egress de stems grandes e crescimento para outras igrejas.
3. **Seguranca multi-igreja:** isolamento por igreja aplicado no servidor (regras), sem auto-elevacao de papel no cliente.
4. **Esforco de migracao** a partir do codigo atual (portas existentes, `firebase.json`, regras ja escritas, login Google ja previsto no `AuthPort`).
5. **Lock-in** e reversibilidade.
6. **Zero-Blocker:** tudo continua rodando localmente sem credencial (adaptadores locais).

## 3. Premissas de custo (explicitas; trocar os numeros nao muda a ordem do ranking, salvo onde indicado)

| Premissa | Valor |
|---|---|
| Tamanho por musica | 13 stems x ~100 MB = **1,3 GB** (faixa 0,65-1,95) |
| Acervo piloto (1 igreja) | 100 musicas = **130 GB** armazenados |
| Egress "so palco" (1 igreja) | 2 aparelhos de palco x ~8 musicas novas/mes x 1,3 GB x fator 2 (re-download por limpeza de cache/troca de aparelho) = **~40 GB/mes** |
| Egress "palco + ensaio em casa com stems" (1 igreja) | + 15 musicos x 6 musicas x 4 semanas x 1,3 GB = **~510 GB/mes** |
| Escala | 10 igrejas = 10x armazenamento e egress (sem deduplicacao entre igrejas) |
| Moeda | USD, sem impostos; converter pelo cambio do dia |

## 4. Precos usados (fonte e data da consulta: 2026-10-20)

| Servico | Numero | Fonte |
|---|---|---|
| Cloud Storage for Firebase | **exige plano Blaze desde 03/02/2026**; bucket `*.firebasestorage.app`: gratis ate 5 GB-mes armazenados e 100 GB/mes baixados (so em us-central1/us-west1/us-east1), depois preco do Google Cloud Storage | firebase.google.com/pricing e firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024 |
| Preco GCS apos a cota | usado **$0,026/GB armazenado** e **$0,12/GB baixado** (valores que a pagina do Firebase lista para o bucket legado `appspot.com`). **NAO VERIFICADO** para o bucket novo: a pagina de precos do GCS nao foi lida por completo | idem |
| Firestore (Standard) | gratis: 1 GiB, 50K leituras/dia, 20K escritas/dia, 10 GiB egress/mes | firebase.google.com/pricing |
| Firebase Auth | gratis ate 50K MAU | firebase.google.com/pricing |
| Supabase Free | $0; 500 MB banco; **1 GB arquivos; upload maximo 50 MB; projeto pausa apos 1 semana sem atividade** | supabase.com/pricing |
| Supabase Pro | a partir de **$25/mes**; 100 GB arquivos (+$0,0213/GB); 250 GB egress (+$0,09/GB nao-cacheado, $0,03 cacheado); upload ate 500 GB; 100K MAU | supabase.com/pricing |
| Cloudflare R2 | **$0,015/GB-mes**; gratis 10 GB-mes, 1M ops classe A, 10M classe B; **egress gratis**; URL pre-assinada so no dominio S3 (`<ACCOUNT_ID>.r2.cloudflarestorage.com`), validade max 7 dias | developers.cloudflare.com/r2/pricing (atualizada 01/10/2026) e /r2/api/s3/presigned-urls |
| Cloudflare Workers | Free: 100.000 requisicoes/dia, 10 ms CPU/invocacao; Paid: minimo $5/mes, 10M req; **sem cobranca de banda/egress** | developers.cloudflare.com/workers/platform/pricing (atualizada 02/10/2026) |

## 5. Opcoes consideradas

### Opcao A: Firebase completo (Auth + Firestore + Cloud Storage)
- **Descricao:** tudo no Google. Stems no bucket `firebasestorage.app`, protegidos por `storage.rules`.
- **Pros (+):** um provedor so; `firebase.json`, `firestore.rules` e `storage.rules` ja existem; login Google nativo; Emulator Suite cobre Auth/Firestore/Storage para testes de regra.
- **Contras (-):** Storage obriga Blaze (cartao); **egress pago acima de 100 GB/mes** — o custo cresce linearmente com cada musico que baixa stems; `storage.rules` precisa fazer `firestore.get()` por requisicao; lock-in alto (Firestore proprietario).

### Opcao B: Supabase completo (Auth + Postgres/RLS + Storage)
- **Descricao:** tudo no Supabase; isolamento por RLS em tabelas e em `storage.objects`.
- **Pros (+):** Postgres relacional (membros N:N, setlists, versoes, relatorios) e portavel (lock-in baixo); RLS em SQL; stack local `supabase start`.
- **Contras (-):** **Free inviavel para este caso**: upload maximo 50 MB (stem tem ate 150 MB), 1 GB de arquivos e pausa apos 1 semana parada. Logo, **piso de $25/mes desde o piloto**; egress de 250 GB incluso, depois $0,09/GB; stack local exige Docker e ~7 GB de RAM; migracao maior (trocar regras e AuthPort ja escritos para Firebase; login Google exige configurar OAuth client no Google Cloud de qualquer jeito).

### Opcao C: Firebase (Auth + Firestore) para identidade/metadados + Cloudflare R2 para stems, servidos por um Worker "porteiro"
- **Descricao:** Firestore guarda igrejas, membros, catalogo, versoes e setlists (pequeno, cabe no Spark gratuito). Stems ficam em R2 com chave por conteudo (`sha256`). Um Cloudflare Worker recebe o pedido do stem com o ID token do Firebase, **pergunta ao Firestore (via REST, com o proprio token do usuario) se ele pode ler aquela versao de musica** — as regras do Firestore continuam sendo a unica autoridade — e devolve o objeto do R2.
- **Pros (+):** **egress zero** em R2 e Workers; Firestore/Auth em Spark ($0) porque nao usamos Cloud Storage do Firebase; reaproveita `firebase.json`, regras, `AuthPort` e login Google; R2 tem API S3 (saida portavel para qualquer object storage).
- **Contras (-):** dois provedores (duas contas); um componente a mais (Worker, ~100 linhas) para manter e testar; validacao de JWT do Firebase dentro do Worker e a consulta REST ao Firestore com token do usuario **ainda nao foram provadas aqui** (spike F3); Firestore continua proprietario.

### Opcao D: Supabase (Auth + Postgres) + R2 para stems
- **Descricao:** como C, trocando Firebase por Supabase para metadados.
- **Pros (+):** egress zero; Postgres portavel; RLS em SQL.
- **Contras (-):** piso de $25/mes (o Free pausa apos 1 semana — igreja que usa o app so no fim de semana corre risco de encontrar o projeto pausado); jogar fora regras/AuthPort ja moldados para Firebase; mesmo Worker porteiro.

### Descartadas sem tabela
- **Continuar no Google Drive como banco:** nao tem modelo de permissao por papel/igreja controlado pelo app, cota de API e de download por arquivo, e nao separa catalogo global de biblioteca privada. Fica so como **fonte de importacao** (Fase 5).
- **Servidor proprio na igreja (NAS/PC servindo a LAN):** custo operacional (alguem mantem ligado, atualizado, com backup) maior que o ganho; o cache offline do aparelho ja cobre o "funciona sem internet". Revisitar so se houver igreja sem internet nenhuma.
- **Backblaze B2 / outros S3:** nao comparados com preco atual nesta rodada; R2 ja zera egress, que e o custo dominante.

## 6. Comparacao (USD/mes, premissas da secao 3)

| Cenario | A. Firebase completo | B. Supabase completo (Pro) | **C. Firebase + R2** | D. Supabase + R2 |
|---|---|---|---|---|
| 1 igreja, so palco (130 GB, 40 GB egress) | ~$3 (storage 125 GB x $0,026; egress na cota) | ~$26 ($25 + 30 GB x $0,0213) | **~$1,80** (120 GB x $0,015; Spark $0) | ~$27 |
| 1 igreja, palco + ensaio (510 GB egress) | ~$52 (+410 GB x $0,12) | ~$49 (+260 GB x $0,09) | **~$1,80** | ~$27 |
| 10 igrejas, so palco (1,3 TB, 400 GB egress) | ~$70 (34 + 300 x 0,12) | ~$64 | **~$19,50** (+ Firestore talvez em Blaze: centavos) | ~$45 |
| 10 igrejas, palco + ensaio (5,1 TB egress) | ~$630 | ~$487 | **~$19,50** | ~$45 |
| Offline no palco | igual em todas: depende do cache IndexedDB, nao do provedor | = | = | = |
| Multi-igreja / regras | Rules (ja existem, precisam reescrita) | RLS SQL | Rules + Worker delega ao Firestore | RLS + Worker |
| Esforco de migracao (codigo atual) | medio | alto | **medio** (+ Worker) | alto (+ Worker) |
| Lock-in | alto | baixo | medio (Firestore proprietario; stems em S3 portavel) | baixo |
| Conta/cartao do Samuel | Google Blaze (cartao) | Supabase Pro (cartao) | Google (Spark, sem cartao) + Cloudflare (R2: **cadastro de meio de pagamento provavelmente exigido mesmo no gratuito — NAO VERIFICADO**) | Supabase Pro + Cloudflare |

Leitura: em A e B o custo **escala com quantas vezes alguem baixa stems**, o que penaliza exatamente o uso desejado (todos com acesso). Em C e D o custo escala so com **o que esta guardado**. Entre C e D, C nao tem piso fixo e reaproveita o que ja existe.

## 7. Decisao (proposta)

**Opcao C: Firebase Auth + Firestore (metadados, membros, setlists, regras) + Cloudflare R2 (stems) atras de um Worker porteiro; IndexedDB continua sendo a fonte no palco.**

Motivos ligados aos drivers: (2) custo ~$2/mes no piloto e ~$20/mes com 10 igrejas independentemente de quanta gente baixa; (4) reaproveita `firebase.json`, regras e o formato do `AuthPort`; (3) uma unica autoridade de permissao (regras do Firestore), o Worker nao decide nada sozinho; (5) stems em API S3 sao portaveis; Firestore fica atras de portas, entao trocar por Supabase (opcao D) depois custa reescrever adaptadores, nao o dominio.

**Condicao de validade:** o spike da Fase 3 precisa provar (a) validacao do ID token Firebase no Worker, (b) leitura no Firestore REST com o token do usuario respeitando as regras, (c) download de um stem de 150 MB pelo Worker Free sem estourar 10 ms de CPU. Se (c) falhar: Worker Paid ($5/mes) ou URL pre-assinada de leitura gerada pelo Worker (dominio S3, validade curta). Se (a)/(b) falharem: Opcao D vira a recomendacao.

## 8. Consequencias

### Positivas (+)
- Custo de distribuicao de stems deixa de ser variavel; liberar ensaio em casa com stems nao muda a conta.
- Permissao centralizada nas regras do Firestore, testavel no emulador.
- Arquivos com chave por `sha256`: deduplicacao, cache imutavel e verificacao de integridade no aparelho.

### Negativas / compromissos aceitos (-)
- Dois provedores e um Worker para manter; segredos do R2 vivem so no Worker (nunca no app).
- Firestore Spark tem 50K leituras/dia: com muitas igrejas pode exigir Blaze (pago por uso, centavos) — monitorar.
- Licenciamento (ver spec, secao 7) limita o que pode ir para o catalogo global; a ferramenta nao resolve direito autoral, so impede redistribuicao indevida por desenho.

## 9. Referencias
- Firebase pricing e FAQ de Storage (consultados 2026-10-20).
- Supabase pricing; docs Storage/RLS via context7 `/websites/supabase` (consultados 2026-10-20).
- Cloudflare R2 pricing (atualizada 2026-10-01), R2 presigned URLs, Workers pricing (atualizada 2026-10-02).
- `docs/consultoria-multitrack/06_Conteudo_Seguranca_e_Direitos.md` (posicao anterior: nuvem como backup privado por congregacao).
