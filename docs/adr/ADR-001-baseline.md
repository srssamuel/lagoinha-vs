# ADR-001: Arquitetura Inicial do Motor de Áudio e Playback Multitrack (Lagoinha VS)

- **Status:** Aceito
- **Data:** 2026-10-17
- **Decisores:** Principal Architect, Lead Audio Engineer, Ministério de Louvor Lagoinha João Pessoa
- **Consultados:** Equipe de Áudio e Músicos do Altar

---

## 1. Contexto e Declaração do Problema

O ministério de louvor da Lagoinha João Pessoa necessita de uma plataforma intuitiva, estável e profissional para disparo de multitracks ("VS"), metrônomo (click) e guias vocais durante os cultos e ensaios. 
As soluções de mercado proprietárias (como MultiTracks Playback ou Loop Community Prime) exigem assinaturas mensais recorrentes em dólar, plataformas fechadas e muitas vezes apresentam complexidade desnecessária para voluntários que operam no púlpito. O Ableton Live, por sua vez, é uma DAW complexa, pesada e arriscada para operação ao vivo por voluntários não treinados.

O sistema precisa:
1. Tocar múltiplos arquivos de áudio simultâneos (stems: Drums, Bass, Guitars, Keys, Pad, Click, Guia, FX) em perfeita sincronia temporal (sem drift).
2. Fornecer controle individual de volume, pan, solo e mute por track.
3. Permitir roteamento independente de fone (IEM para os músicos) e som da casa (PA / Auditório), dividindo saídas estéreo simples (L = Fone com click; R = PA limpo) ou interfaces USB multicanal.
4. Suportar pulos dinâmicos quantizados por seções da música (Intro, Verso, Refrão, Ponte, Espontâneo) sem atropelar o tempo.
5. Possuir gerador de Pad ambiente contínuo para fundos de oração entre as músicas.

---

## 2. Drivers de Decisão (Critérios de Avaliação)

- **Driver 1: Confiabilidade e Latência Zero no Palco:** Não travar nem dessincronizar durante cultos ao vivo.
- **Driver 2: Simplicidade Operacional para Voluntários:** Interface limpa, com botões táteis grandes, legíveis sob baixa iluminação.
- **Driver 3: Custo Zero de Licenciamento:** Autonomia total para a igreja sem depender de assinaturas de apps gringos.
- **Driver 4: Portabilidade:** Funcionar diretamente no navegador como Progressive Web App (PWA) e empacotável em desktop (Tauri/Electron).
- **Driver 5: Isolamento de Barramento (Segurança de Áudio):** Blindagem total contra vazamento de metrônomo/click para as caixas do auditório.

---

## 3. Opções Consideradas

### Opção 1: Web Audio API Nativa com React 19 + TypeScript (Escolhida)
- **Descrição:** Motor de áudio desenvolvido sobre o grafo de nós de alta precisão da Web Audio API (`AudioContext`, `GainNode`, `ChannelSplitterNode`, `ChannelMergerNode`), desacoplado da UI via Clean Architecture.
- **Prós (+):**
  - Clock temporal com precisão de hardware (`AudioContext.currentTime`).
  - Execução imediata em qualquer notebook (Windows, Mac, Linux) sem instalação de DAWs.
  - Portabilidade total: pode rodar como PWA offline ou encapsulado em binário desktop nativo via Tauri.
  - Matriz de roteamento de canais flexível sem dependências nativas pesadas.
- **Contras (-):**
  - Requer manipulação cuidadosa de buffers de áudio para evitar consumo excessivo de memória em setlists longos.

### Opção 2: Template em Ableton Live com Controlador MIDI
- **Descrição:** Utilizar sessões pré-configuradas no Ableton Live Suite.
- **Prós (+):** DAW de padrão mundial.
- **Contras (-):** Custo de licença alto por máquina, interface poluída para voluntários, curva de aprendizado íngreme, risco de cliques acidentais desconfigurarem a sessão durante o culto.

### Opção 3: DAW C++ / JUCE Desktop Puro
- **Descrição:** Desenvolver do zero um software C++ compilado via JUCE.
- **Prós (+):** Desempenho nativo extremo e suporte direto a drivers ASIO.
- **Contras (-):** Complexidade de compilação, tempo excessivo de desenvolvimento e manutenção cara.

---

## 4. Decisão Escolhida

Escolhemos a **Opção 1 (Web Audio API + React 19 + TypeScript + Clean Architecture)** porque entrega precisão de microssegundos em reprodução de áudio, opera 100% offline, permite empacotamento desktop imediato e entrega uma experiência de usuário (UX) pensada milimetricamente para a realidade dos cultos da Lagoinha João Pessoa.

---

## 5. Consequências e Efeitos Colaterais

### Positivas (+)
- Interface Dark Stage com tipografia monoespaciada para BPM e status de fácil leitura a 3 metros de distância no palco.
- Modo Split Fone/PA integrado em 1 clique: músicos ouvem o click e guia no canal esquerdo (L), e o auditório recebe apenas os instrumentos no canal direito (R).
- Gerador de Pad contínuo nos 12 tons integrado, evitando o vazio sonoro no momento de orações e palavras pastorais.
- Capacidade de importação de arquivos WAV/MP3 locais ou multitracks sintetizadas para testes imediatos.

### Negativas / Compromissos Aceitos (-)
- Para arquivos WAV pesados de 10 minutos com 16 stems descompactados, o consumo de memória RAM deve ser monitorado; mitigado pelo carregamento por demanda (streaming de chunks / AudioBuffer pool).

---

## 6. Referências e Literatura de Apoio
- W3C Web Audio API Specification (W3C Recommendation)
- Loop Community Prime / MultiTracks Playback Functional Architecture
- Clean Architecture: A Craftsman's Guide to Software Structure and Design (Robert C. Martin)
