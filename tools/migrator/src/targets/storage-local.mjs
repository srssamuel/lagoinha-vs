// Alvo "local": uma pasta que simula o R2 (mesma chave do contrato) + um registro tipo D1 ao lado.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { r2Key } from './keys.mjs';

export class LocalStorage {
  /** @param {string} root pasta que simula o bucket */
  constructor(root, { uploadedBy = 'migrator-local' } = {}) {
    this.name = 'local';
    this.root = root;
    this.uploadedBy = uploadedBy;
    this.stats = { heads: 0, puts: 0, putBytes: 0, verifies: 0, sources: 0 };
    fs.mkdirSync(path.join(root, '_tmp'), { recursive: true });
  }

  objectPath(scope, sha256) {
    return path.join(this.root, ...r2Key(scope, sha256).split('/'));
  }

  registryPath(scope, sha256) {
    return path.join(this.root, '_d1', scope.replace(/[^a-z0-9-]/g, '_'), `${sha256}.json`);
  }

  async head(scope, sha256) {
    this.stats.heads++;
    const op = this.objectPath(scope, sha256);
    const rp = this.registryPath(scope, sha256);
    if (!fs.existsSync(op) || !fs.existsSync(rp)) return { exists: false };
    return { exists: true, size: fs.statSync(op).size };
  }

  /**
   * @param {() => import('node:stream').Readable} openStream
   * @returns {Promise<{created:boolean}>} lanca Error('sha256_mismatch') se o conteudo nao bater (como o R2)
   */
  async put(scope, sha256, openStream, { size, contentType, originalName } = {}) {
    const cur = await this.head(scope, sha256);
    if (cur.exists) return { created: false };
    const tmp = path.join(this.root, '_tmp', `${crypto.randomUUID()}.part`);
    const hash = crypto.createHash('sha256');
    let written = 0;
    try {
      await pipeline(
        openStream(),
        async function* (src) {
          for await (const c of src) {
            hash.update(c);
            written += c.length;
            yield c;
          }
        },
        fs.createWriteStream(tmp),
      );
      if (hash.digest('hex') !== sha256) throw new Error('sha256_mismatch');
      const op = this.objectPath(scope, sha256);
      fs.mkdirSync(path.dirname(op), { recursive: true });
      fs.renameSync(tmp, op);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    const rp = this.registryPath(scope, sha256);
    fs.mkdirSync(path.dirname(rp), { recursive: true });
    const row = {
      blob: {
        scope, sha256, size: written, content_type: contentType ?? null, original_name: originalName ?? null,
        integrity: 'r2-sha256', uploaded_by: this.uploadedBy, uploaded_at: new Date().toISOString(),
      },
      sources: [],
    };
    fs.writeFileSync(`${rp}.tmp`, JSON.stringify(row, null, 1));
    fs.renameSync(`${rp}.tmp`, rp);
    this.stats.puts++;
    this.stats.putBytes += written;
    return { created: true };
  }

  /** Re-hash do objeto gravado (o "HEAD" do local nao prova o conteudo). */
  async verify(scope, sha256, { size } = {}) {
    this.stats.verifies++;
    const op = this.objectPath(scope, sha256);
    if (!fs.existsSync(op)) return { ok: false, detail: 'objeto ausente' };
    const st = fs.statSync(op);
    if (size != null && st.size !== size) return { ok: false, detail: `tamanho ${st.size} != ${size}` };
    const h = crypto.createHash('sha256');
    for await (const c of fs.createReadStream(op)) h.update(c);
    return h.digest('hex') === sha256 ? { ok: true } : { ok: false, detail: 'sha256 do objeto gravado diverge' };
  }

  async recordSource(scope, sha256, src) {
    const rp = this.registryPath(scope, sha256);
    if (!fs.existsSync(rp)) throw new Error('blob nao registrado no escopo');
    const row = JSON.parse(fs.readFileSync(rp, 'utf8'));
    const i = row.sources.findIndex((s) => s.kind === src.kind && s.sourceId === src.sourceId);
    const rec = { ...src, recorded_by: this.uploadedBy, recorded_at: new Date().toISOString() };
    if (i >= 0) row.sources[i] = rec;
    else row.sources.push(rec);
    fs.writeFileSync(`${rp}.tmp`, JSON.stringify(row, null, 1));
    fs.renameSync(`${rp}.tmp`, rp);
    this.stats.sources++;
  }
}
