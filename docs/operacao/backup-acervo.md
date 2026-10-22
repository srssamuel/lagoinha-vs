# Backup e restauração da biblioteca

Sem custo novo: o backup grava neste computador (ou num HD externo). Um segundo bucket no R2 é opcional e tem custo (seção 4).

## 1. O que é guardado

| Parte | Origem | Arquivo no backup |
|---|---|---|
| Registro completo (arquivos, procedência, publicações, eventos de publicar/retirar) | D1 `lagoinha-vs-stems-registry` | `metadados/d1-<data>.sql` |
| Músicas publicadas e a versão publicada de cada uma (título, artista, tom, BPM, direitos, stems e funções) | Firestore, pela mesma leitura pública do visitante (sem login) | `metadados/catalogo-<data>.json` |
| Áudio original de cada arquivo da biblioteca | R2 `lagoinha-vs-stems`, prefixo `catalog/` | `audio/catalog/<sha256>` |
| Resumo (contagens, bytes, faltas, sha256 do .sql) | — | `backup-<data>.json` |

Cada arquivo de áudio só entra no backup depois de ter o sha256 conferido. O backup é incremental: o que já está lá não baixa de novo. `--escopo tudo` inclui também o áudio das igrejas (cerca de 35 GB hoje).

Rascunhos (salvos e não publicados) entram pelo D1 e pelo áudio, mas os metadados deles ficam só no Firestore: a leitura pública não os vê.

## 2. Rodar

```bash
node scripts/backup-acervo.mjs
```

```bash
node scripts/backup-acervo.mjs --dest E:\backup-lagoinha-vs
```

Destino padrão: `%LOCALAPPDATA%\lagoinha-vs\backup-acervo`. O comando usa o login do `wrangler` deste computador. Termina com `BACKUP OK` ou `BACKUP INCOMPLETO` (código 1, com a lista do que não conferiu; basta rodar de novo).

## 3. Restaurar

Ensaio (não toca produção): reconstrói D1 e R2 num Worker local novo e confere que toda música publicada tem todos os arquivos.

```bash
node scripts/restore-acervo.mjs --from %LOCALAPPDATA%\lagoinha-vs\backup-acervo --para %TEMP%\lagoinha-restaurado
```

Demonstrado automaticamente em `npm run e2e:acervo` (etapa 14): backup do estado local, segunda rodada incremental sem baixar nada, restauração num Worker novo, os 4 stems da música publicada servidos com o mesmo sha256 e o rascunho continuando privado.

Restaurar em produção (decisão do Samuel, depois de um incidente):
1. D1: primeiro o Time Travel do próprio D1 (`wrangler d1 time-travel restore lagoinha-vs-stems-registry --timestamp <ISO>`), que volta o banco a um minuto anterior; o `.sql` do backup é a segunda linha.
2. R2: `wrangler r2 object put lagoinha-vs-stems/catalog/blobs/<sha256> --remote --file audio/catalog/<sha256> --content-type <tipo>` para cada arquivo que falte (o tipo está na tabela `blobs`).
3. Firestore: regravar `catalog/{songId}` e `catalog/{songId}/versions/{versionId}` a partir do `catalogo-<data>.json` pelo console ou pelo painel (salvar de novo a música reconstrói os mesmos ids).

## 4. Proteções que já existem no serviço

- Bucket R2 sem regra de expiração; as chaves são o sha256 do conteúdo (um arquivo nunca é sobrescrito por outro).
- O Worker recusa apagar arquivo que pertence a uma versão publicada (`409 published_blob`); retirar uma música não apaga nada.
- D1 Time Travel: restauração para qualquer minuto dos últimos 7 dias (plano Workers Free) ou 30 dias (Workers Paid).

Opcional, com custo: um segundo bucket R2 com Event Notifications, ou cópia agendada, para ter o áudio fora deste computador. Hoje a biblioteca é pequena; o acervo inteiro (cerca de 35 GB) custaria cerca de US$ 0,52 por mês a US$ 0,015/GB-mês, mais operações. Só com a aprovação do Samuel.

## 5. Frequência sugerida

Depois de cada sessão de envio no painel, ou semanal. Agendar no Windows (Agendador de Tarefas) é configuração persistente: fica para quando o Samuel autorizar.
