export interface GoogleDriveConfigProps {
  folderId: string;
  folderName: string;
  sharedUrl: string;
  apiKey?: string;
  accessToken?: string;
  lastSyncedAt?: string;
  autoSyncOnStart?: boolean;
}

export class GoogleDriveConfig {
  public folderId: string;
  public folderName: string;
  public sharedUrl: string;
  public apiKey?: string;
  public accessToken?: string;
  public lastSyncedAt?: string;
  public autoSyncOnStart: boolean;

  constructor(props: GoogleDriveConfigProps) {
    this.folderId = props.folderId;
    this.folderName = props.folderName || 'Multitracks Lagoinha (Google Drive)';
    this.sharedUrl = props.sharedUrl;
    this.apiKey = props.apiKey;
    this.accessToken = props.accessToken;
    this.lastSyncedAt = props.lastSyncedAt;
    this.autoSyncOnStart = props.autoSyncOnStart ?? true;
  }

  /**
   * Extrai o ID da pasta do Google Drive a partir de qualquer formato de URL ou ID bruto:
   * - https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ
   * - https://drive.google.com/drive/u/1/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ?usp=sharing
   * - https://drive.google.com/open?id=1aBcDeFgHiJkLmNoPqRsTuVwXyZ
   * - 1aBcDeFgHiJkLmNoPqRsTuVwXyZ
   */
  public static extractFolderId(input: string): string | null {
    if (!input) return null;
    const trimmed = input.trim();

    // Links só valem se forem do próprio Google Drive (evita apontar para outro host).
    if (/^[a-z]+:\/\//i.test(trimmed)) {
      let host: string;
      try {
        host = new URL(trimmed).hostname;
      } catch {
        return null;
      }
      if (host !== 'drive.google.com') return null;
    }

    // Caso 1: URL padrão /drive/folders/{id} ou /drive/u/N/folders/{id}
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch && folderMatch[1]) {
      return folderMatch[1];
    }

    // Caso 2: URL de parâmetro id={id}
    const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idParamMatch && idParamMatch[1]) {
      return idParamMatch[1];
    }

    // Caso 3: ID alfanumérico direto (geralmente 25 a 45 caracteres)
    if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  /** IDs de arquivo/pasta do Drive: só letras, dígitos, `_` e `-` (nada que quebre a query `'id' in parents`). */
  public static isValidDriveId(id: string): boolean {
    return /^[A-Za-z0-9_-]{10,}$/.test(id);
  }
}
