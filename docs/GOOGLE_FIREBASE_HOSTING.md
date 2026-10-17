# Guia de Hospedagem no Google (Firebase Hosting, Login Google e Banco de VS)

Este guia documenta como publicar o **Lagoinha VS** nas ferramentas oficiais do **Google (Firebase & Google Cloud)** para obter link público seguro (HTTPS), login de acesso institucional e banco de armazenamento de multitracks na nuvem.

---

## 1. Arquitetura no Ecossistema Google

```
                                [Usuários / Músicos da Lagoinha]
                                  (Windows, Mac, iPad, Android)
                                                │
                                                ▼ HTTPS (Link Público)
                                    ┌───────────────────────┐
                                    │ Google Firebase       │
                                    │ Hosting (CDN Global)  │
                                    │ lagoinha-vs.web.app   │
                                    └───────────┬───────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
        ┌─────────────────────────┐                           ┌─────────────────────────┐
        │ Google Identity / Auth  │                           │ Google Cloud Storage    │
        │ • Login com Google      │                           │ • "Banco de VS"         │
        │ • Email e Senha Membros │                           │ • Áudios WAV / MP3      │
        │ • Controle de Papéis    │                           │ • Sincronização Setlist │
        └─────────────────────────┘                           └─────────────────────────┘
```

---

## 2. Como Gerar o Link Público no Google (Firebase Hosting)

O Firebase Hosting é a ferramenta gratuita oficial do Google para entrega de Progressive Web Apps (PWAs) com SSL automático.

### Passo 1: Criar o Projeto no Console do Google
1. Acesse: [console.firebase.google.com](https://console.firebase.google.com/) com a sua conta Google.
2. Clique em **"Adicionar projeto"** e dê o nome: `lagoinha-vs` (ou `lagoinha-vs-jp`).
3. Conclua a criação do projeto.

### Passo 2: Fazer o Deploy em 1 Comando
No terminal da pasta do projeto (`C:\Projetos IA\02_PROJETOS_ATIVOS\lagoinha-vs`):

```bash
# 1. Login na sua conta Google pelo terminal
npx firebase login

# 2. Publicar os arquivos compilados da pasta dist/
npx firebase deploy --only hosting
```

Após rodar o comando, o Google gera imediatamente os links públicos oficiais:
- 🔗 `https://lagoinha-vs.web.app`
- 🔗 `https://lagoinha-vs.firebaseapp.com`
*(Você também pode vincular gratuitamente seu domínio próprio da igreja, por exemplo: `https://vs.lagoinhajp.com.br`)*

---

## 3. Login de Acesso e Controle de Membros

A aplicação possui a tela de autenticação [`AuthGate.tsx`](file:///C:/Projetos%20IA/02_PROJETOS_ATIVOS/lagoinha-vs/src/presentation/components/AuthGate.tsx):

- **Login com Google (1 Clique):** Qualquer membro ou líder com Gmail autorizado pode entrar diretamente.
- **Login com Email/Senha:** Para computadores compartilhados da mesa de som.
- **Controle de Papéis:**
  - **Líder / Ministro (`leader`):** Pode subir novos arquivos de VS para a nuvem, deletar tracks e alterar a ordem do culto.
  - **Músico / Banda (`musician`):** Pode apenas dar play, mutar seus canais no fone, ensaiar e tocar no culto.
- **Modo Ensaio Offline:** Permite acesso instantâneo pré-configurado sem travar o ensaio caso o altar fique temporariamente sem internet.

---

## 4. O "Banco de VS" na Nuvem (Google Cloud Storage & Firestore)

O componente [`CloudVSLibraryModal.tsx`](file:///C:/Projetos%20IA/02_PROJETOS_ATIVOS/lagoinha-vs/src/presentation/components/CloudVSLibraryModal.tsx) conecta o altar ao repositório central:

1. **Repositório Centralizado:**
   - Em vez de cada músico carregar pendrives ou ter que passar arquivos pesados de 500 MB no WhatsApp/Telegram, os stems ficam salvos no Google Cloud Storage.
2. **Sincronização do Culto de Domingo:**
   - Quando o ministro monta o repertório do culto das 19h no notebook dele, a lista e os stems ficam disponíveis para todos os músicos no app.
3. **Upload de Novos VS:**
   - Formulário integrado para subir novos pacotes de stems (Click, Guia, Drums, Bass, Guitarras, Teclados, Pads) com definição de Tom e BPM.
