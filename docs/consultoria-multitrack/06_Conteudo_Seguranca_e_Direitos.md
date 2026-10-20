# 06 — Conteúdo, Direitos Autorais, Segurança e LGPD
## Matriz Jurídica, Propriedade Intelectual e Proteção de Dados

**Data:** 19/10/2026  
**Especialidade:** Compliance Jurídico, Direito Autoral (Lei 9.610/98), Software (Lei 9.609/98) e LGPD (Lei 13.709/18)  
**Status:** Parecer Orientador para Comercialização e Piloto  

---

## 1. Matriz de Direitos Autorais por Tipo de Conteúdo

O maior risco jurídico de qualquer plataforma de áudio para igrejas reside na confusão entre **"ter o arquivo no computador"** e **"ter o direito de armazenar, transmitir ou compartilhar esse arquivo em rede"**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   CLASSIFICAÇÃO DE ATIVOS MUSICAIS                     │
├─────────────────────┬───────────────────┬──────────────┬───────────────┤
│ Tipo de Conteúdo    │ Uso Local (Palco) │ Nuvem Privada│ Compartilhar  │
├─────────────────────┼───────────────────┼──────────────┼───────────────┤
│ 1. Stems Próprios   │ PERMITIDO         │ PERMITIDO    │ PERMITIDO     │
│    (Gravados Igreja)│                   │              │ (Entre Equipe)│
├─────────────────────┼───────────────────┼──────────────┼───────────────┤
│ 2. MultiTracks/Loop │ PERMITIDO         │ RESTRITO     │ PROIBIDO      │
│    Comprados Oficial│ (Licença Pessoal) │ (Backup Só)  │ (Público/Web) │
├─────────────────────┼───────────────────┼──────────────┼───────────────┤
│ 3. Cifras e Letras  │ PERMITIDO         │ PERMITIDO    │ PERMITIDO     │
│    Litúrgicas       │ (Uso Religioso)   │ (Uso Equipe) │ (Sem Venda)   │
├─────────────────────┼───────────────────┼──────────────┼───────────────┤
│ 4. Transmissão Live │ EXIGE CCLI /      │ NÃO SE APLICA│ NÃO SE APLICA │
│    (YouTube/Culto)  │ DIREITO AUTORAL   │              │               │
└─────────────────────┴───────────────────┴──────────────┴───────────────┘
```

### Análise dos Termos Contratuais da MultiTracks.com (Seção 2):
* Os termos de uso de downloads de tracks da MultiTracks estabelecem que o comprador adquire uma licença pessoal e intransferível para uso em apresentações ao vivo dentro de sua congregação local.
* **Cláusula Restritiva:** É expressamente vedado fazer upload desses stems para plataformas públicas, servidores de terceiros ou criar serviços de compartilhamento/distribuição de mixagens derivadas.
* **Implicação para o Produto:** A plataforma **NÃO PODE** ser promovida como um "servidor aberto de multitracks comerciais". A modalidade comercial deve ser rigorosamente **BYOC (Bring Your Own Content)**: o usuário armazena seus próprios arquivos localmente em sua máquina, e a nuvem da plataforma realiza apenas o backup privado encriptado daquela congregação específica.

### Matriz de Diferenciação das Modalidades de Uso:
1. **Arquivamento e Backup Privado:**
   - *Finalidade:* Preservação de dados da congregação contra falhas de hardware local.
   - *Regra:* Os arquivos brutos (.ZIP, .WAV) são armazenados em bucket encriptado isolado por `churchId`. O download é restrito a administradores e técnicos autorizados daquela congregação.
2. **Reprodução Local (Palco / Culto Presencial):**
   - *Finalidade:* Execução em tempo real na máquina do operador durante ensaios e cultos.
   - *Regra:* Permissão coberta pela licença local de execução litúrgica. Todo o áudio decodificado permanece na RAM e no IndexedDB da máquina local (`audio_blobs`), sem retransmissão para a internet.
3. **Ensaio Compartilhado (EnsaioMix / Estudo Domiciliar):**
   - *Finalidade:* Preparação individual de instrumentistas e cantores antes do ensaio geral.
   - *Regra:* Acesso via credencial autenticada de membro. O áudio é renderizado com stems de prática atenuados/destacados para fins exclusivamente pedagógicos e internos, com URLs de streaming assinadas de curta duração (60 minutos).
4. **Transmissão Ao Vivo (Live Stream / YouTube):**
   - *Finalidade:* Envio de áudio para a mesa de transmissão do culto via internet.
   - *Regra:* O uso de playbacks na transmissão ao vivo requer cobertura específica da congregação (licença CCLI Streaming ou autorização direta dos titulares da obra). O sistema Lagoinha VS isola as saídas 1 e 2 para PA/Transmissão e as saídas 3 e 4 (Click e Guia) estritamente para os fones de ouvido dos músicos, impedindo o vazamento do metrônomo para o sinal do streaming.

---

## 2. Titularidade do Software e Propriedade Intelectual (Lei 9.609/98)

Para que o projeto se torne um produto comercial seguro e escalável, a titularidade jurídica do código-fonte deve estar inequivocamente formalizada:

1. **Autoria e Direitos Patrimoniais:**
   * O software foi desenvolvido por **Samuel Rosa**. De acordo com o Art. 4º da Lei de Software (Lei 9.609/98), os direitos sobre o programa pertencem a quem o desenvolve, salvo se decorrente de contrato de trabalho ou vínculo formal com a instituição prevendo cessão integral.
   * **Recomendação Prática:** Registrar o código-fonte perante o **INPI (Instituto Nacional da Propriedade Industrial)** em nome da pessoa física ou pessoa jurídica (CNPJ) de Samuel Rosa.
2. **Uso da Marca e Vínculo Institucional com a Igreja:**
   * O nome *"Lagoinha"* é marca registrada da Igreja Batista da Lagoinha. Utilizar comercialmente a marca "Lagoinha VS" para vender software a terceiros acarretaria notificação extrajudicial e risco de litígio.
   * **Ação Obrigatória:** O produto comercial adotará uma **marca neutra e independente** (ex: *WorshipFlow*, *Selah Audio* ou *Kadosh Tracks*). A Lagoinha JP figurará formalmente como **"Igreja Piloto / Case de Estudo"**.

---

## 3. Conformidade com a LGPD (Lei 13.709/18) e Dados Sensíveis

Igrejas e ministérios de louvor lidam com uma categoria especial de dados pessoais regulamentada pelo **Artigo 5º, Inciso II da LGPD**: **Dados Religiosos e Filiação Religiosa são classificados como DADOS PESSOAIS SENSÍVEIS**.

### Diretrizes de Privacidade Obrigatórias na Plataforma:
1. **Minimização Estrita de Dados:**
   * O sistema deve coletar exclusivamente o indispensável para a operação: Nome completo, E-mail e Função no Louvor (ex: Tecladista, Operador de Áudio).
   * **PROIBIÇÃO:** Nunca coletar dados financeiros de membros, histórico de dízimos, endereços residenciais ou dados familiares na plataforma de playback.
2. **Termo de Consentimento e Base Legal:**
   * Base legal adotada: *Execução de Contrato e Legítimo Interesse para a prestação dos serviços musicais*.
   * Política de Privacidade transparente explicando que os dados cadastrais servem exclusivamente para liberação do acesso às ferramentas de áudio da equipe.
3. **Direito ao Esquecimento e Exclusão:**
   * Qualquer voluntário que deixar a equipe pode solicitar a exclusão total de sua conta e histórico em até 15 dias.

---

## 4. Arquitetura de Segurança e Isolamento Multi-Tenant

Para que múltiplas igrejas compartilhem a mesma infraestrutura em nuvem sem risco de vazamento de informações ou músicas:

```
                  ┌──────────────────────────────────────────────┐
                  │          FIREBASE AUTHENTICATION             │
                  │   Custom Claims: { tenantId: "igreja_01" }   │
                  └──────────────────────┬───────────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
     ┌───────────────────────────────────┐ ┌───────────────────────────────────┐
     │       TENANT A (Igreja 01)        │ │       TENANT B (Igreja 02)        │
     │  Firestore: /churches/igreja_01   │ │  Firestore: /churches/igreja_02   │
     │  Storage: gs://bucket/igreja_01/* │ │  Storage: gs://bucket/igreja_02/* │
     │  Setlists e Músicas Isoladas      │ │  Setlists e Músicas Isoladas      │
     └───────────────────────────────────┘ └───────────────────────────────────┘
```

### Regras de Isolamento Criptográfico e de Acesso:
* **Token JWT Enriquecido (Custom Claims):** Ao autenticar o usuário, o backend injeta a propriedade `churchId` no token de segurança.
* **Isolamento de Banco:** Toda requisição no Firestore passa pela regra `request.auth.token.churchId == resource.data.churchId`. Tentativas de leitura de dados de outras igrejas retornam `HTTP 403 Forbidden` instantâneo.
* **Assinatura Temporária de Áudio (Signed URLs):** Os links de download dos stems de áudio expiram automaticamente em **60 minutos**, impedindo compartilhamento de links públicos no WhatsApp ou redes abertas.
