# Incidente: acervo de multitracks removido do Drive (2026-10-21)

Só totais e fatos verificáveis; nomes de pessoas, músicas e ids ficam no relatório local da migração (fora do git).

## Fatos verificados

| Item | Evidência | Resultado |
|---|---|---|
| Conta autenticada | Drive web (Chrome do dono) e banco de metadados do Drive para desktop | mesma conta pessoal (@gmail.com); não é Google Workspace e a pasta não está em drive compartilhado |
| Dono da pasta de multitracks | painel Detalhes da pasta; `is_owner=1` nos metadados | a pasta é do dono da conta |
| Dono dos arquivos dentro dela | `is_owner` por id do inventário (3.895 arquivos) | **11 do dono da conta; os demais de outra conta** (um colaborador com quem a pasta era compartilhada) |
| Atividade 20/out 23:46–23:47 | painel Atividades | por mudança na pasta-mãe, centenas de itens passaram a "qualquer pessoa com o link: leitor" |
| Atividade 21/out 16:08 | painel Atividades | "por mudança em uma pasta-mãe, o acesso foi restrito a 4 itens"; o colaborador perdeu acesso; a pasta foi colocada automaticamente na raiz de "Meu Drive" |
| Atividade 21/out 16:10–16:33 | painel Atividades | o colaborador (dono dos arquivos) moveu lotes para a lixeira (16:22–16:26) e excluiu permanentemente lotes (16:10, 16:24, 16:31, 16:33) |
| Lixeira do dono da conta | Drive web | não contém os stems: itens de outro dono vão para a lixeira **do dono deles**, não para a de quem tinha acesso |
| Situação atual da pasta | Drive web e `G:` | 4 pacotes `.zip` do dono da conta (criados em 20/out, ~42 MB cada) |
| Sharing atual da pasta | painel Detalhes | **qualquer pessoa na internet com o link pode ver** |

A autoria das exclusões está registrada pelo próprio Drive. A causa da mudança na pasta-mãe às 16:08 não foi determinada: o painel mostra o efeito, não quem o provocou.

## O que já está preservado

- R2 (registro D1, conferido em 22/out ~00:50 UTC): **571 objetos de áudio, 34.737.467.391 bytes**, todos no escopo da igreja, todos com procedência registrada; nenhum upload ou reserva pendente.
  - 558 vieram do Drive (519 arquivos soltos + stems extraídos de zips) e 13 do lote local; nenhum hash é comum aos dois grupos.
- Firestore (biblioteca da igreja, leitura em 22/out): 41 músicas (21 publicadas, 20 pendentes de decisão), 41 versões, 551 stems referenciados nas versões. A diferença de 20 entre blobs (571) e stems referenciados (551) ainda não foi conciliada item a item. Hipóteses a verificar: stems de músicas pendentes ainda sem versão, ou o mesmo conteúdo referenciado mais de uma vez. Nenhum desses blobs foi apagado.
- Manifesto da migração, logs e relatórios em `%LOCALAPPDATA%\lagoinha-vs\migracao-nuvem\` (preservados; nenhuma limpeza).
- Lista dos 896 arquivos não migrados (situação no Drive, estado, categoria, bytes, caminho) em `relatorios\nao-migrados-2026-10-21.csv`, fora do git.

## Correspondência entre os conjuntos (sem somar sobreposições)

| Conjunto | Unidade | Quantidade | Observação |
|---|---|---:|---|
| Inventário original do Drive | arquivos | 3.895 | inclui lixeira, projetos de DAW, auxiliares |
| Fila planejada de stems (relato anterior) | stems | 1.211 | número histórico; a fila efetiva da carga foi recalculada a cada execução |
| Migrados e verificados (Drive → R2) | blobs | 558 | contados no D1 por procedência; inclui stems extraídos de zips |
| Não migrados | arquivos | 896 | 389 falhos na fila + 507 aguardando decisão |
| ...situação desses 896 no Drive | arquivos | 565 / 329 / 3 | lixeira do dono dos arquivos / sem registro / ainda presentes |
| Lote local (zip baixado) | stems | 13 | não pertence ao inventário do Drive; manifesto próprio (`migracao-local`); 13/13 verificados no R2, música publicada |

O lote local não tem o mesmo md5 de nenhum item do inventário. O Drive tem hoje um zip da mesma música com 41,6 MB, enquanto o zip local tem 203 MB: são arquivos diferentes, e o lote local não é contado como recuperação do acervo.

## Caminhos de recuperação aplicáveis

1. **Itens movidos para a lixeira (565 identificados, ~2,3 GB):** só o dono deles pode restaurar, pela lixeira da conta dele, em até 30 dias (até ~20/nov/2026). Fonte: support.google.com/drive/answer/1716222.
2. **Itens excluídos permanentemente pelo dono:** não há restauração pela conta de quem só tinha acesso. Se a conta do dono for Google Workspace, o administrador dele pode restaurar em até 25 dias após o esvaziamento da lixeira (knowledge.workspace.google.com, recover-deleted-files). Se for conta pessoal, só o suporte do Google, a pedido do dono, sem garantia.
3. **Perda de acesso, sem exclusão:** a página support.google.com/drive/answer/15701190 cobre esse caso, com `is:limited_access` e o pedido ao dono para compartilhar de novo. Não se aplica aos lotes que constam como excluídos.

## Pendente

- Ação do dono dos arquivos: restaurar a lixeira dele, consultar o administrador (se for Workspace) ou o suporte, e compartilhar de novo a pasta.
- Decisão do dono da conta: o link público da pasta de multitracks (material com direitos de terceiros) deve ser restrito.
- Retomar a carga (`migrate --retry-failed`) só depois que a origem voltar. A conferência de md5 impede subir conteúdo diferente do inventariado.
