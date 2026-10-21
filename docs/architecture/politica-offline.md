# Política offline: aplicativo, material preparado e atualização

- **Status:** 2026-10-21. Complementa `spec-banco-online.md` (seção 5), `ADR-001-banco-online-e-acervo.md` e `contrato-stems-worker.md`.
- **Legenda:** *validado* = existe comando que falhou/passou (`npm run e2e:offline`); *spec* = o que `spec-banco-online.md` define; *lacuna* = a spec não define, registrado sem inventar regra.

## 1. Dois estados que não se confundem

| Estado | O que significa | Onde mora | Como a interface mostra |
|---|---|---|---|
| **Aplicativo disponível offline** | Service worker ativo e o app inteiro (HTML, JS, chunks sob demanda, CSS, ícones, manifest) em cache. Não inclui nenhum áudio. | Cache do service worker (Workbox *precache*) | Chip "App disponível offline" (`PwaStatus`) |
| **Culto preparado no aparelho** | Cada música do culto foi baixada, conferida por `sha256` e gravada com **todos** os stems no IndexedDB (`PrepareServiceUseCase`; a música só é gravada depois de ter todo o áudio). | IndexedDB (`songs`, `audio_blobs`) | Chip "Culto preparado no aparelho: N música(s)" e o relatório de "Preparar e abrir offline" |

Só os dois juntos garantem tocar um culto sem internet. O primeiro é automático (abrir o app online uma vez); o segundo é uma ação antes do culto. O chip conta as músicas do acervo presentes no repertório do aparelho; a prova de que **todas** as do culto estão lá continua sendo o relatório da preparação (`failed` vazio), conforme a spec ("100% pronto ou lista do que falta").

## 2. O que o service worker guarda (e o que não guarda)

- **Precache de todo o build** gerado a cada `vite build`, com revisão por conteúdo. Navegação offline cai em `index.html`.
- **Fora do cache, de propósito:** chamadas ao Firebase (Auth, Firestore) e ao Worker de stems. São autenticadas e não passam pelo service worker (`runtimeCaching` vazio). O áudio offline vive só no IndexedDB, nunca no cache do service worker.
- `public/stems/` (faixas de desenvolvimento, fora do git) é excluído do precache.
- O navegador pode descartar caches e IndexedDB sob pressão de armazenamento; `navigator.storage.persist()` segue obrigatório (spec, seção 5, ENG-01).

## 3. Atualização em momento seguro

- `registerType: 'prompt'`, sem `skipWaiting` nem `clientsClaim` automáticos. A versão nova baixa em segundo plano e **fica em espera**.
- Com reprodução ou pad ao vivo, a atualização fica pendente e **invisível**; o app nunca recarrega sozinho.
- Parado o palco, aparece um aviso com "Atualizar agora" e "Depois". Só o toque aplica e recarrega. O culto preparado (IndexedDB) sobrevive à atualização.
- Checagem de nova versão ao abrir o app e a cada 15 minutos. Recomendação operacional: atualizar fora do culto, com o aparelho online.

## 4. Acesso ao material preparado sem conexão

**O que a spec define**
- Durante o culto "nada depende de internet"; o player lê só o snapshot local (seção 5.3). Isto vale também para o aparelho que nunca mais se conecta.
- O acesso **online** é decidido pelas regras do Firestore, com o token do usuário; um membro removido ou suspenso perde leitura e papel imediatamente nas rotas do Worker (contrato do Worker, seção de revogação). O ID token vale até 1 h, mas é o Firestore que nega.
- Limpeza de cache só por ação do usuário ou com folga de quota, nunca durante o modo culto (seção 5.5).

**Consequência, dita sem rodeio:** um aparelho desconectado **não recebe revogação instantânea**. O material já preparado continua tocando offline até o aparelho voltar a falar com o servidor. O que cessa na próxima conexão é o acesso *ao servidor* (novos downloads, novos cultos, Preparar); o que acontece com o material **já gravado** no IndexedDB nessa hora **não é definido pela spec**.

**Lacunas registradas (decisão do Samuel/produto, não inventadas aqui)**
1. Prazo máximo que um aparelho pode ficar sem validar o vínculo (TTL de licença offline): **não definido**.
2. Ao reconectar e descobrir que o membro foi suspenso/removido, o app **apagar** o material preparado ou apenas **bloquear** a abertura: **não definido**. O código atual não faz nenhuma das duas (verificado no e2e: o app reabre e toca sem rede, sem nenhuma checagem local de vínculo).
3. Música com direito revogado/retirada do acervo: a spec cobre `rightsClass` na entrada (regras), não a retirada do que já está nos aparelhos.
4. Comportamento do app, ao reconectar, para "o líder alterou o setlist" é o da seção 5.3/5.4 da spec (aviso, nunca aplicado no meio de uma música); não há regra equivalente para "acesso removido".

Até essas lacunas serem decididas, a postura documentada é: **o material preparado é uma cópia descartável do que está na nuvem (spec, tabela de dados) que o aparelho pode tocar enquanto estiver sem conexão; revogar o acesso encerra o acesso ao servidor, não apaga cópia em aparelho offline.** Quem precisa de revogação com efeito no aparelho precisa decidir (1) e (2).

## 5. Validação

- `npm run e2e:offline` (build de produção, Playwright com perfil persistente, emuladores Firebase + Worker local, stems sintéticos): abre online → login (emulador) → prepara o culto → confere SW ativo, precache = arquivos do `dist`, stems no IndexedDB → fecha → reabre o **mesmo perfil** com o contexto offline, servidor do app derrubado e rotas abortadas → acessa o culto e toca (AudioContext `running`, relógio avançando) → publica build v2 durante a reprodução (sem recarga, aviso só depois de parar, aplicar funciona, v2 abre offline).
- `npm run e2e:offline -- --without-sw`: controle. Mesmo roteiro com o service worker bloqueado; **deve falhar** na etapa offline (`ERR_INTERNET_DISCONNECTED`).
- **Não coberto (pendente, ação física/do Samuel):** login Google real; homologação em tablet real e com interface de áudio USB; comportamento de Safari/iPad com cota de armazenamento.
