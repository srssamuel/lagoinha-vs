# 07 — Modelo de Negócio, Precificação e Plano de Piloto
## Estrutura Comercial, Unit Economics e Programa Piloto de 90 Dias

**Data:** 19/10/2026  
**Especialidade:** Finanças, Precificação SaaS e Estratégia Go-To-Market  
**Autor:** Conselho Comercial e de Negócios  

---

## 1. A Proposta de Precificação e Empacotamento (Packaging)

Para romper a barreira do mercado brasileiro e substituir concorrentes dolarizados, a oferta comercial deve ser simples, sem pegadinhas e com valor previsível aprovável pelo conselho da igreja:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      PLANO OFICIAL: "IGREJA EM CONEXÃO"                │
│                                                                        │
│                      R$ 129,00 / mês por congregação                   │
│                     (ou R$ 1.188,00 no plano anual — R$ 99/mês)        │
├────────────────────────────────────────────────────────────────────────┤
│ • 1 Computador Principal de Palco (Altar)                              │
│ • 1 Computador de Standby / Reserva (Hot-Spare para emergências)       │
│ • Acesso Ilimitado para Músicos da Equipe (Cifras e Estudo em Casa)    │
│ • Armazenamento em Nuvem Privada (Até 50 GB de Stems da Igreja)        │
│ • Motor Multicanal 4CH Discreto com Guia de Calibração e Tom de Teste  │
│ • Trava de Tonalidade Harmônica (Pitch Lock em Bateria/Guia)           │
│ • Suporte Dedicado via WhatsApp para Líderes de Louvor                 │
└────────────────────────────────────────────────────────────────────────┘
```

### Por que esse modelo funciona?
* **Sem cobrança por usuário/músico:** Igrejas odeiam pagar por assento porque voluntários entram e saem da equipe constantemente. Liberar acesso ilimitado para os músicos da congregação gera adesão viral interna.
* **Standby incluído de fábrica:** A igreja ganha a tranquilidade de ter um segundo notebook espelhado no som sem custo adicional.

---

## 2. Unit Economics e Simulação Financeira

Abaixo apresentamos a modelagem financeira aritmética para uma base inicial de **100 igrejas clientes ativas**:

| Linha da DRE Simulada | Valor por Cliente | Total Mensal (100 Igrejas) | Observações e Premissas |
| :--- | :---: | :---: | :--- |
| **Receita Bruta (MRR)** | **R$ 129,00** | **R$ 12.900,00** | 100 congregações no plano mensal padrão. |
| (-) Tributos / Impostos (Simples Nacional ~6%) | (R$ 7,74) | (R$ 774,00) | Alíquota inicial de serviços de tecnologia. |
| (-) Gateway de Pagamento / Boletos (Asaas/Stripe ~3.5%) | (R$ 4,50) | (R$ 450,00) | Taxa de processamento de cartão e emissão de boletos. |
| (-) Custos de Nuvem por Cliente (Storage + Tráfego) | (R$ 18,50) | (R$ 1.850,00) | Média de 40 GB armazenados no Google Cloud / Firebase. |
| (-) Custos de Mensageria e Autenticação (Firebase Auth) | (R$ 1,20) | (R$ 120,00) | Autenticação e tokens de convite. |
| (-) Provisão de Suporte Técnico de Primeiro Nível | (R$ 9,00) | (R$ 900,00) | Horas de atendimento e onboarding. |
| **(=) Margem de Contribuição Líquida** | **R$ 88,06 (68,2%)** | **R$ 8.806,00** | **Margem operacional sólida para reinvestimento.** |

### Ponto de Equilíbrio (Break-Even):
* Assumindo custos fixos estruturais de **R$ 15.000,00 / mês** (desenvolvedor sênior, marketing e ferramentas):
  $$\text{Clientes para Ponto de Equilíbrio} = \frac{\text{R\$ 15.000,00}}{\text{R\$ 88,06}} \approx \mathbf{171 \text{ igrejas}}$$
* O ponto de equilíbrio é atingível em um horizonte de 12 a 18 meses com atuação focada em redes pastorais e conferências de louvor.

---

## 3. O Programa Piloto Alpha / Beta (Plano de 90 Dias)

Para validar o produto em condições reais de mercado sem queimar a reputação da marca, o lançamento deve seguir um funil rigoroso:

```
[ MÊS 1: Gate 0 e Gate 1 ] ──> [ MÊS 2: Piloto em 8 Igrejas ] ──> [ MÊS 3: Lançamento Comercial ]
 • Homologação de bancada       • Onboarding assistido              • Abertura de inscrições
 • Teste de 8h contínuas        • Cultos reais supervisionados      • Campanha com líderes chave
 • Auditoria da base            • Métricas de feedback coletadas    • Cobrança oficial recorrente
```

### Critérios de Seleção das 8 Igrejas Piloto:
1. Pelo menos **duas igrejas de denominações tradicionais** (ex: Batista, Presbiteriana) com equipes voluntárias rígidas.
2. Pelo menos **duas igrejas pentecostais/carismáticas** (com momentos longos de ministração espontânea para testar o *Modo Liberdade*).
3. Pelo menos **duas igrejas de pequeno porte (< 250 membros)** operando com notebooks modestos (i3 / i5 com 8 GB de RAM).
4. Pelo menos **duas igrejas que utilizam mesas digitais USB** (Behringer X32 ou XR18).

### Condições do Piloto:
* **Gratuidade Total:** 60 dias de uso completo e sem custo da plataforma.
* **Compromisso da Igreja:** Conceder acesso para 1 entrevista semanal de 20 minutos com o líder de louvor e o operador de som, além de reportar qualquer incidente de palco imediatamente.

---

## 4. Métricas de Sucesso do Piloto (KPIs)

Para aprovar a transição do Piloto para a Comercialização Oficial (Gate 3), os seguintes indicadores devem ser atingidos:
1. **Taxa de Confiabilidade de Palco:** $\ge 99,5\%$ de cultos executados sem nenhuma interrupção, crash de software ou vazamento de áudio.
2. **Tempo de Preparação do Setlist:** Redução de pelo menos **50%** no tempo gasto pelo líder de louvor para aprontar as músicas da semana em comparação ao método anterior (Ableton/pendrives).
3. **Autonomia do Operador Voluntário:** O operador substituto deve ser capaz de ligar o computador, abrir o setlist e conduzir o culto sem qualquer ajuda de Samuel Rosa após um treinamento em vídeo de 15 minutos.
4. **Intenção de Pagamento Pós-Piloto:** Pelo menos **6 das 8 igrejas piloto (75%)** devem concordar em contratar a assinatura paga de R$ 129/mês ao término do período gratuito.
