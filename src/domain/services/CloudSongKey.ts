/**
 * Identidade de uma música do acervo online dentro do aparelho: prateleira + música + versão.
 * A versão faz parte da chave para que uma versão nova no acervo nunca substitua a preparada para o culto.
 */
export interface CloudSongKeyParts {
  source: 'church' | 'global';
  songId: string;
  versionId: string;
}

const PATTERN = /^cloud:(church|global):([^@:]+)@([^@:]+)$/;

export function formatCloudSongKey(parts: CloudSongKeyParts): string {
  if (!parts.songId || !parts.versionId || /[@:]/.test(parts.songId + parts.versionId)) {
    throw new Error('Música ou versão inválida para o acervo online.');
  }
  return `cloud:${parts.source}:${parts.songId}@${parts.versionId}`;
}

export function parseCloudSongKey(id: string): CloudSongKeyParts | null {
  const match = PATTERN.exec(id);
  return match ? { source: match[1] as 'church' | 'global', songId: match[2]!, versionId: match[3]! } : null;
}
