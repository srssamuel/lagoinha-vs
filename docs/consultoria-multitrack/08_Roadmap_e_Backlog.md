# 08 — Roadmap e Backlog de Engenharia
## Fases de Desenvolvimento, Gates de Liberação e Itens Priorizados

**Data:** 19/10/2026  
**Responsável:** Coordenação Técnica de Engenharia e Produto  
**Status:** Backlog Ativo para os Próximos Ciclos  

---

## 1. Estrutura de Gates de Liberação

O desenvolvimento segue uma disciplina estrita de transição de fases. Nenhuma funcionalidade de fases avançadas é implementada antes da aprovação do Gate anterior:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   GATE 0:    │ ──> │   GATE 1:    │ ──> │   GATE 2:    │ ──> │   GATE 3:    │
│  AUDITORIA   │     │  PALCO REAL  │     │PILOTO EXTERNO│     │ COMERCIAL    │
│ (Concluído)  │     │  (Em Curso)  │     │  (Mês 2)     │     │  (Mês 3)     │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

* **Gate 0 (Base Auditada):** Código inspecionado, suíte de 62 testes executada, riscos mapeados e plano documental aprovado. *(Concluído)*
* **Gate 1 (Núcleo de Palco Homologado):** Persistência blindada no IndexedDB, 4 saídas validadas em hardware físico USB, detecção segura de desconexão de cabo e zero vazamento de áudio digital.
* **Gate 2 (Fluxo de Equipe e Piloto):** Isolamento multi-tenant de igrejas no Firestore/Storage, modo liberdade aprimorado e piloto de 60 dias em 8 igrejas ativas.
* **Gate 3 (Lançamento Comercial):** Empacotamento desktop (.exe leve via Tauri v2), gateway de cobrança recorrente, termos de uso e abertura oficial de vendas.

---

## 2. Matriz do Backlog Priorizado (Épicos e Histórias)

| ID | Épico | Problema a Resolver | Usuário Beneficiado | Comportamento Esperado | Prioridade | Esforço (Confiança) | Critério de Aceite | Evidência de Conclusão |
| :---: | :--- | :--- | :--- | :--- | :---: | :---: | :--- | :--- |
| **ENG-01** | *Confiabilidade Offline* | O navegador pode limpar o cache local se o disco encher | Técnico de Som / Músico | O app solicita permissão explícita de persistência durável (`navigator.storage.persist()`) | **P0** | 1 dia (Alta) | `navigator.storage.persisted()` retorna `true` no console | Screenshot do status de cota no navegador e teste unitário |
| **ENG-02** | *Segurança de Hardware* | Puxar o cabo USB pode direcionar o click para as caixas de som | Técnico de Som | Ao detectar perda da placa USB (`ondevicechange`), o player pausa instantaneamente com alerta visual | **P0** | 2 dias (Alta) | Click e stems são silenciados em menos de 100ms sem soar no laptop | Teste de bancada simulando desconexão em Playwright |
| **ENG-03** | *Isolamento Multi-Tenant* | Igrejas diferentes não podem ver dados ou músicas umas das outras | Administrador da Igreja | Firestore Security Rules bloqueiam qualquer requisição sem o `churchId` do usuário | **P0** | 3 dias (Alta) | Tentativa de leitura de outro tenant retorna HTTP 403 | Testes automatizados com Firebase Emulator Suite |
| **ENG-04** | *Voz Guia Procedural* | Beeps senoidais no click podem confundir músicos menos experientes | Músicos da Banda | Síntese de áudio ou samples leves de voz humana em português ("1, 2, 3, 4, Refrão") | **P1** | 2 dias (Média) | Contagem falada audível com clareza nos canais 3 e 4 | Reprodução no fone in-ear confirmada por músicos |
| **ENG-05** | *Modo Liberdade no Compasso* | Parar a música no meio da estrofe corta o fluxo litúrgico | Ministro de Louvor | Botão "Liberdade" aguarda o tempo forte do próximo compasso para fazer fade dos stems | **P1** | 3 dias (Alta) | Stems silenciam no Beat 1 mantendo pad/click sem interrupção | Medição em osciloscópio digital de áudio |
| **ENG-06** | *Presets de Formação de Banda* | Músicos faltam com frequência nos cultos de quinta/domingo | Líder de Louvor | Botões "Sem Tecladista", "Sem Guitarra Solo" ativam/desativam stems gravados correspondentes | **P1** | 2 dias (Alta) | Stems do instrumento ausente são desmutados em 1 clique | Teste de estado no `MultitrackMixer.tsx` |
| **ENG-07** | *Empacotamento Desktop Tauri* | Voluntários podem fechar a aba do Chrome por engano durante o culto | Técnico de Som | Aplicativo Windows `.exe` nativo com janela travada em tela cheia sem abas | **P2** | 5 dias (Média) | Instalador `.msi` funcional consumindo menos de 150 MB de RAM | Execução limpa no Windows 11 sem dependência de browser aberto |
| **ENG-08** | *Gateway de Assinaturas* | Necessidade de cobrar mensalidades de forma automatizada no Brasil | Financeiro da Plataforma | Integração com Asaas/Stripe para emissão de Pix, Boletos e Cartão recorrente | **P2** | 4 dias (Alta) | Webhook processa pagamento e libera acesso da igreja automaticamente | Transação de teste aprovada em sandbox |

---

## 3. Planejamento Temporal dos Próximos 90 Dias

```
SEMANAS 1 A 3 (GATE 1 — ENGENHARIA DE BASE):
├── ENG-01: Blindagem de armazenamento com navigator.storage.persist()
├── ENG-02: Tratamento de desconexão segura de hardware USB
└── Bateria de 8 horas de bancada contínua no computador do piloto

SEMANAS 4 A 7 (GATE 2 — MULTI-TENANT E PILOTO EXTERNO):
├── ENG-03: Implementação de Firestore Rules e separação de tenants
├── ENG-04 & ENG-05: Contagem falada em português e refinamento do Modo Liberdade
└── Onboarding supervisionado nas 8 igrejas parceiras selecionadas

SEMANAS 8 A 12 (GATE 3 — PRODUTO COMERCIAL E TAURI):
├── ENG-07: Empacotamento desktop Tauri v2 para Windows
├── ENG-08: Conexão do gateway de pagamento Pix/Cartão
└── Lançamento da marca comercial e abertura de vagas para novas igrejas
```
