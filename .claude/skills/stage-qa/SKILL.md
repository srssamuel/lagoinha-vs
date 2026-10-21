---
name: stage-qa
description: Roteiro de teste de palco do Lagoinha VS antes de entregar uma versao para culto ou ensaio (notebook ou tablet ligado a mesa, palco escuro, possivelmente sem internet). Use quando pedirem "testa para o culto", "pode usar no domingo?" ou antes de anunciar uma correcao de audio como pronta.
disable-model-invocation: true
---

# Teste de palco

Objetivo: dizer com evidencia se a versao aguenta um culto, e separar o que o teste provou do que so o ouvido confirma.

## 1. Automatico (precisa passar antes de tudo)

Rode e cole as linhas finais:
- `npm test`
- `npm run typecheck`
- `npm run test:rules` (se mexeu em Firebase)
- `npm run demo:e2e` (fluxo acervo -> culto -> offline -> sem Drive), quando a mudanca toca biblioteca, preparo ou login

Qualquer falha encerra o roteiro: a versao nao vai para o palco.

## 2. Roteiro no app (pelo navegador, tablet emulado 768x1024 e notebook 1440)

1. Abrir o culto da igreja e "Preparar e abrir offline". Conferir quantas musicas prepararam e o motivo de cada falha.
2. Cortar a rede (modo aviao ou offline no navegador) e recarregar: o culto abre e toca do aparelho.
3. Tocar 3 musicas trocando o tom de cada uma (para cima e para baixo, 1 e 2 semitons). Registrar se o estado do player mudou sem erro no console.
4. Pular para refrao e ponte durante a reproducao: o pulo acontece no inicio do compasso.
5. Terminar uma musica: o pad continua sem corte.
6. Modo Split: conferir pelo medidor ou pela inspecao do grafo que click e guia so saem no canal L.
7. Contraste e toque: textos legiveis no tema escuro, botoes de palco com alvo grande, tela nao apaga durante a musica.

## 3. So o ouvido confirma (marcar como pendente de ouvido, nunca como aprovado)

- Ausencia de clique/estalo na troca de tom e nos pulos.
- Qualidade do pitch shift (artefatos, voz "metalica").
- Click alinhado com a banda (latencia da interface de audio).
- Volume relativo de click, guia e pad nos fones.

## 4. Relatorio

Tabela por item: PASS / FAIL / PENDENTE DE OUVIDO, com a evidencia (saida de comando, print ou observacao). Termine com a decisao: pronto para culto, pronto so para ensaio, ou nao usar, e o motivo.
