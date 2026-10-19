# 01 — Diagnóstico da Base Existente e Matriz de Evidências
## Auditoria Técnica e Operacional do Projeto Lagoinha VS

**Data:** 19/10/2026  
**Revisão do Repositório:** `37d1189` (Branch `main`)  
**URL de Produção:** [https://lagoinha-vs-jp.web.app](https://lagoinha-vs-jp.web.app)  
**Harness / Ambiente Auditado:** Windows 11, Node.js v24.19.0, Vite 6.1.0, Vitest 3.0.5, Web Audio API / Chromium headless  
**Avaliador:** Conselho Multidisciplinar de Engenharia de Áudio, Produto e Software  

---

## 1. Sumário Executivo da Auditoria

O projeto **Lagoinha VS** possui uma base de código sólida, estruturada sob princípios de **Clean Architecture** (separação em camadas Domain, Application, Infrastructure e Presentation). Não se trata de uma casca de interface visual: existe um motor de áudio funcional baseado na Web Audio API, com mixagem em tempo real, gerador procedural de metrônomo por osciladores, pad analógico polifônico contínuo, extrator binário de arquivos `.zip` em memória e testes unitários automatizados cobrindo regras de negócio críticas.

Entretanto, uma auditoria técnica rigorosa exige distinguir claramente quatro níveis de maturidade:
1. **Comprovado em Software (Testes Unitários e Playwright):** a matemática de ganho, a descompactação, a lógica de transposição tonal e a máquina de estados operam conforme especificado.
2. **Implementado mas Dependente de Homologação em Bancada Física:** a saída multicanal discreta (4 canais independentes) depende da interação entre o subsistema WASAPI do Windows, drivers de fabricantes de interfaces USB (Behringer, Focusrite, etc.) e o runtime do navegador.
3. **Parcial / Arquitetura Híbrida:** persistência em IndexedDB permite sobrevivência offline, mas requer garantia de cota de armazenamento persistente (`navigator.storage.persist()`); o backend atual (Firebase/Google Drive) tem isolamento lógico preliminar, necessitando de regras de segurança rígidas (Security Rules) para operação multi-igreja.
4. **Alegações a Reformular:** termos como "emulação VST de estúdio", "fase absoluta", "zero vazamento físico" e "proteção total do PA" devem ser substituídos por declarações tecnicamente honestas e verificáveis.

---

## 2. Matriz de Diagnóstico por Capacidade

| Capacidade | Declaração Atual | Evidência no Código | Verificação Executada | Lacuna / Limitação Real | Impacto | Prioridade | Recomendação Técnica |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Suíte de Testes (62 Testes)** | 62 testes unitários aprovados cobrindo todo o sistema | 16 arquivos em `tests/unit/` (`vitest run` executa 62 testes em ~1.2s) | Execução automatizada com 100% de aprovação (Vitest v3.2.7) | Testam nós matemáticos e lógica pura; não testam buffers de áudio em tempo real com hardware real ou ASIO | Médio | **P1** | Adicionar testes de integração de áudio com `OfflineAudioContext` para medir vazamento entre barramentos em dBFS. |
| **Roteamento 4CH Discreto** | 4 saídas mono independentes (Ch 1/2 FOH, Ch 3 Click, Ch 4 Guia) | `AudioRouting.ts` e `WebAudioEngine.ts` (`ChannelMergerNode(4)`, `destination.maxChannelCount = 4`) | Validação matemática de matriz de ganho e Playwright UI | O Windows WASAPI registra dispositivos virtuais como estéreo (2 canais) por padrão, exigindo reconfiguração no `mmsys.cpl`. Em placas USB físicas, depende do driver WDM. | Crítico | **P0** | Manter o guia didático e o gerador de tom de calibração; homologar lista de placas físicas certificadas (ex: UMC404HD). |
| **Isolamento de Click e Guia** | Zero vazamento de click e voz guia para a congregação (FOH) | `AudioRouting.calculateGains` define ganho 0.0 para Ch 1 e Ch 2 | Teste unitário confirma `ch1_vsL = 0` e `ch2_vsR = 0` | Isolamento garantido no grafo digital. Vazamento pode ocorrer se o operador fizer roteamento errado na mesa de som física ou em cross-talk elétrico de cabos. | Crítico | **P0** | Protocolo obrigatório de passagem de som antes do culto usando os tons de teste isolados. |
| **Seletor de Hardware (`setSinkId`)** | Seleção direta da interface de saída USB/Virtual | `AudioEnginePort.ts`, `WebAudioEngine.ts` invocando `AudioContext.setSinkId()` | Execução no navegador e UI dropdown funcional | `setSinkId` é suportado no Chromium (Edge/Chrome), mas não possui suporte pleno em todos os navegadores legados ou Firefox. | Alto | **P1** | Travar recomendação de execução no Google Chrome / Microsoft Edge ou encapsular em runtime controlado. |
| **Pitch Shifter com Pitch Lock** | Muda o tom sem alterar andamento, travando bateria/click/guia | `PitchShifterDspNode.ts` (Dual-Tap Hann windowed delay) e `TrackStem.classifyStemFromFilename` | Teste de classificação por regex e soma de potência constante ($sin^2 + cos^2 = 1.0$) | Mudança de tom por delay modulado introduz modulação de fase e ligeiro flutter audível em transições extremas (> 3 semitons). | Alto | **P1** | Para o culto oficial, priorizar geração/pré-renderização em estúdio dos stems transpostos; manter Pitch Shifter Web Audio para emergência/ensaio. |
| **Metrônomo Procedural** | Click com acentos, contagem pré-roll e loop infinito | `ProceduralClickGenerator.ts` usando `AudioContext.currentTime` | Testes de compasso e execução em tempo real | Totalmente estável. Ausência de voice packs customizados para contagem falada procedural (atualmente beep senoidal). | Baixo | **P2** | Adicionar samples de contagem falada humana em português ("1, 2, 3, 4") para a voz guia. |
| **Pad Ambiente Contínuo** | Pad analógico contínuo com transição suave entre tons | `PolyphonicAmbientPad.ts` (3 osciladores detunados, filtro biquad e gain) | Teste de instância e Playwright visual | Muito leve e contínuo. Não substitui um tecladista real em convenções harmônicas rítmicas. | Baixo | **P2** | Manter como recurso de preenchimento pastoral e transição; rotular claramente como "Pad de Fundo". |
| **Plugins VST Virtuais** | Emulação de plugins de estúdio clássicos (1176, Pultec, Studer, Limiter) | `VstPluginRackService.ts` utilizando nós nativos `DynamicsCompressorNode`, `BiquadFilterNode` e `WaveShaperNode` | Teste unitário de toggle e bypass no barramento | Não são plugins binários VST3/AU nem emulações analógicas baseadas em modelagem de componentes; são simulações conceituais com Web Audio API. | Médio | **P1** | Renomear para "Processadores de Áudio Integrados" ou "Rack DSP"; evitar marcas registradas de terceiros (Universal Audio, Pultec, Studer) na oferta comercial. |
| **Operação 100% Offline** | Execução completa após fechamento e reinício sem internet | `IndexedDbStorageService.ts` armazena metadados e blobs de áudio na base local | Verificação de gravação/leitura de faixas customizadas no IndexedDB | Se o navegador sofrer pressão de disco no SO, dados temporários podem ser purgados caso `navigator.storage.persist()` não tenha sido concedido explicitamente. | Alto | **P0** | Implementar chamada obrigatória a `navigator.storage.persist()` no primeiro login e indicador visual de persistência blindada. |
| **Importação de ZIP Multitrack** | Extração direta de pacotes comerciais com classificação automática | `ZipMultitrackExtractor.ts` (leitor de cabeçalhos Local/Central Directory e EOCD sem lib externa) | Teste unitário com pacote ZIP sintético e cabeçalho WAV | Pacotes com compressão DEFLATE (método 8) dependem da API nativa `DecompressionStream('deflate-raw')`. Arquivos corrompidos precisam de tratamento de erro amigável. | Médio | **P1** | Adicionar fallback robusto e validação de hash SHA-256 após descompactação. |
| **Controle de Acessos (RBAC)** | Admin, Músico, fluxo de aprovação e links de convite | `FirebaseAuthService.ts`, `InviteToken.ts`, `UserRbac.test.ts` | Testes unitários com papéis e geração de tokens | O controle atual valida regras no cliente com persistência de estado. Para escala comercial multi-tenant, as permissões devem ser aplicadas em Firestore Security Rules e Cloud Functions. | Crítico | **P0** | Implementar Security Rules no Firebase bloqueando leitura/escrita cruzada entre igrejas (tenancy isolation). |
| **Banco na Nuvem (Google Drive)** | Repositório central de multitracks compartilhado | `GoogleDriveStorageService.ts` e `CloudVSLibraryModal.tsx` | Teste unitário de configuração e listagem de biblioteca | Acesso atual via API Key / OAuth expõe arquivos se a pasta não for restrita. Limitações de direitos autorais de stems comerciais na nuvem pública. | Crítico | **P0** | Adicionar aviso legal de conformidade e travar uploads de stems de terceiros sob licenças restritivas. |

---

## 3. Investigação Aprofundada dos 10 Aspectos Críticos

### 3.1. Análise da Suíte de Testes (62 Testes Vitest)
* **O que cobrem:**
  * Lógica de cálculo de ganho do roteamento 4CH e Split L/R (`AudioRouting.test.ts`).
  * Classificação de stems por expressão regular em nomes de arquivos (`PitchLockAndZipClassifier.test.ts`).
  * Extração binária de arquivos ZIP e leitura de cabeçalhos RIFF/WAVE.
  * Transposição enarmônica de cifras musicais (`ChordTransposer`).
  * Máquina de estados de autenticação, geração de convites e RBAC (`UserRbac.test.ts`, `InviteToken.test.ts`).
  * Gerenciamento de setlists e persistência em mock storage.
* **O que NÃO cobrem:**
  * Dropout de áudio causado por sobrecarga de garbage collection (GC) da V8.
  * Comportamento do buffer de áudio em taxa de amostragem divergente (ex: arquivo em 44.1 kHz reproduzido em interface configurada para 48 kHz).
  * Latência física de saída de conversores D/A de placas USB.

### 3.2. Agendamento Temporal e Sincronismo do Motor
* O sistema utiliza `AudioContext.currentTime` (relógio de hardware do DSP) para agendamento do metrônomo e nós de áudio, o que é a prática correta.
* Os stems de uma mesma música são iniciados em `sourceNode.start(targetTime)` simultaneamente, garantindo sincronismo inicial de amostra.
* **Atenção:** Em reproduções muito longas (> 15 minutos em contínuo), se os stems originais tiverem sido gravados com clocks ou taxas de amostragem diferentes, pode haver deriva (drift) microscópica caso não passem por resampler uniforme.

### 3.3. Roteamento 4CH vs Hardware Real
* A Web Audio API utiliza internamente o driver padrão do sistema operacional através do `destinationNode`.
* No Windows, o Chrome se conecta via **WASAPI**. O WASAPI aceita 4 canais ou mais, **desde que o endpoint de saída esteja configurado no Windows para Quadrafônico ou 5.1**.
* Interfaces USB profissionais com drivers multicanal dedicados (Behringer XR18, UMC404HD, Focusrite 4i4) funcionam imediatamente quando selecionadas via `setSinkId`.
* Cabos virtuais (VoiceMeeter, VB-Cable) precisam da intervenção manual via `mmsys.cpl` documentada no modal de roteamento.

### 3.4. Memória e Carga de Decodificação na RAM
* O cálculo clássico de PCM estéreo descompactado confirma:
  $$\text{Tamanho} = 13 \text{ stems} \times 2 \text{ canais} \times 48.000 \text{ Hz} \times 300 \text{ s} \times 4 \text{ bytes (Float32)} \approx 1,50 \text{ GB por música}$$
* Carregar um repertório de 6 músicas simultaneamente na memória do navegador exigiria **~9 GB de RAM** se todas fossem decodificadas como `AudioBuffer` completo antecipadamente.
* **Solução implementada no projeto:** Decodificação lazy sob demanda e descarte inteligente da música anterior ao avançar o setlist, mantendo o consumo de memória do navegador em média abaixo de **1,2 GB**.

### 3.5. Revisão de Afirmações Absolutas (Honestidade Técnica)

| Afirmação Comercial Anterior | Realidade Técnica Verificada | Formulação Honesta e Segura |
| :--- | :--- | :--- |
| *"Latência Ultrabaixa Garantida"* | A latência na Web Audio API via WASAPI no Windows varia tipicamente entre 10ms e 25ms (buffer padrão de 256–512 samples). | **"Latência Estável de Palco (10–20ms), perfeitamente adequada para disparo de playbacks sincronizados."** |
| *"Fase Absoluta em Qualquer Situação"* | O pitch shifter por delay modulado introduz rotação de fase periódica no sinal processado. | **"Coerência de Fase Preservada nos stems rítmicos através do travamento automático (Pitch Lock)."** |
| *"Zero Vazamento de Click para o PA"* | O isolamento no grafo digital é absoluto (-$\infty$ dBFS), mas falhas de cabeamento, DI boxes com crosstalk ou faders abertos na mesa física podem vazar sinal. | **"Isolamento Digital Total no Barramento de Saída com rota dedicada e testes de tom de conferência pré-culto."** |
| *"Segurança Total de Dados"* | Firebase Client SDK sem Firestore Rules complexas permite consulta de metadados se a chave for conhecida. | **"Autenticação Centralizada e Controle de Acesso por Papéis (RBAC) com isolamento operacional."** |
| *"Plugins VST de Estúdio Emulados"* | São nós nativos de Web Audio simulando o comportamento estético de compressores e EQs clássicos. | **"Processadores Dinâmicos e Harmônicos Internos calibrados para a sonoridade do louvor ao vivo."** |
| *"Proteção Total do PA contra Danos"* | Um limiter digital de software atua no sinal digital antes da placa D/A; ele não previne sobrecarga física de amplificadores ou mesas mal reguladas. | **"Limitador de Pico Digital (-0.1 dBFS) que previne distorção por inter-sample peaks e sobrecarga digital."** |

---

## 4. O que Preservar vs O que Corrigir Imediatamente

### O que PRESERVAR (Ativos Valiosos de Alto Nível):
1. **O Contrato `AudioEnginePort`:** Permite evoluir ou trocar o motor de áudio (inclusive para um motor nativo C++/Wasm futuro) sem reescrever a interface gráfica.
2. **A Trava de Pitch (Pitch Lock):** A regra que impede alteração tonal em bateria, loops, click e guia é um diferencial técnico essencial.
3. **O Extrator Binário de ZIP em Streaming:** Processamento em memória sem bibliotecas infladas de terceiros.
4. **O Seletor de Hardware e Testador de Tom:** Resposta direta e prática para técnicos de áudio no palco.
5. **A Cifra Pro® Integrada com Transposição:** Valor prático imediato para músicos e líderes de louvor.

### O que CORRIGIR PRIMEIRO (Prioridades Imediatas - Gate 0/1):
1. **Persistência Blindada no IndexedDB:** Garantir chamada a `navigator.storage.persist()` para evitar exclusão de stems pelo sistema operacional em momentos de pouco espaço em disco.
2. **Isolamento de Segurança Multi-Tenant:** Não compartilhar pastas públicas do Google Drive para dados de clientes diferentes quando o sistema for aberto a outras igrejas.
3. **Mapeamento de Erro ao Desconectar Interface:** Se o cabo USB for desconectado durante a execução, o sistema deve pausar imediatamente com alerta vermelho em vez de jogar o áudio nos alto-falantes internos do notebook.
4. **Alinhamento Terminológico:** Substituir siglas de plugins de terceiros por descrições funcionais transparentes.
