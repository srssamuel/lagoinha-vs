// Alvo "local" do Firestore: JSON em disco, mesma forma de caminho (churches/{c}/library/{song}/versions/{v}).
import fs from 'node:fs';
import path from 'node:path';

const SAFE = /^[A-Za-z0-9_-]{1,128}$/;
const safe = (s) => {
  if (!SAFE.test(s)) throw new Error(`id invalido: ${s}`);
  return s;
};

export class LocalRegistry {
  constructor(root, { uid = 'migrator-local' } = {}) {
    this.name = 'local';
    this.root = root;
    this.uid = uid;
    this.stats = { songWrites: 0, versionCreates: 0 };
  }

  songPath(churchId, songId) {
    return path.join(this.root, 'churches', safe(churchId), 'library', `${safe(songId)}.json`);
  }

  versionPath(churchId, songId, versionId) {
    return path.join(this.root, 'churches', safe(churchId), 'library', safe(songId), 'versions', `${safe(versionId)}.json`);
  }

  async getSong(churchId, songId) {
    const p = this.songPath(churchId, songId);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }

  async setSong(churchId, songId, data) {
    const p = this.songPath(churchId, songId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 1));
    fs.renameSync(`${p}.tmp`, p);
    this.stats.songWrites++;
  }

  /** Versao e imutavel: @returns 'created' | 'exists' */
  async createVersion(churchId, songId, versionId, data) {
    if (!fs.existsSync(this.songPath(churchId, songId))) throw new Error('versao so nasce sob musica existente');
    const p = this.versionPath(churchId, songId, versionId);
    if (fs.existsSync(p)) return 'exists';
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(`${p}.tmp`, JSON.stringify(data, null, 1));
    fs.renameSync(`${p}.tmp`, p);
    this.stats.versionCreates++;
    return 'created';
  }

  async getVersion(churchId, songId, versionId) {
    const p = this.versionPath(churchId, songId, versionId);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
}
