// Relatorios AGREGADOS (so totais, sem nomes, caminhos nem ids) - os unicos que vao para o git.
import fs from 'node:fs';
import path from 'node:path';

const fmt = (n) => Number(n).toLocaleString('pt-BR');
const GiB = (b) => `${(b / 1024 ** 3).toFixed(2)} GiB`;

export function todayStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function writeInventoryDoc(t, docDir, date) {
  const stamp = date ?? todayStamp();
  const pr = t.prior;
  const rows = [];
  const cmp = (label, now, before) => {
    if (before == null) rows.push(`| ${label} | ${fmt(now)} | - | - |`);
    else rows.push(`| ${label} | ${fmt(now)} | ${fmt(before)} | ${now - before >= 0 ? '+' : ''}${fmt(now - before)} |`);
  };
  cmp('Arquivos ativos no Drive (fora da lixeira)', t.cloud.filesActive, pr?.files);
  cmp('Pastas ativas (com a raiz)', t.cloud.foldersActiveIncludingRoot, pr?.folders);
  cmp('Bytes ativos no Drive', t.cloud.bytesActive, pr?.bytes);
  cmp('Audios (formato real pelos bytes)', t.audio.byRealFormat, pr?.audio);
  cmp('Compactados (formato real zip/rar/7z)', t.archives.byRealFormat, pr?.archives);
  cmp('Arquivos no disco G: (sem desktop.ini)', t.disk.filesMatched + t.disk.localOnlyOther.files, pr?.localFiles);
  cmp('Subpastas no disco G:', t.disk.subfoldersMatched + t.disk.localOnlyDirs, pr?.localDirs);
  cmp('Bytes no disco G: (com desktop.ini)', t.disk.bytesMatched + t.disk.localOnlyBytes, pr?.localBytes);

  const md = `# Inventario do acervo (${stamp})

Somente totais agregados. Nomes, caminhos e ids do Drive ficam fora do git (manifesto local do migrador).
Fonte: SQLite de metadados do Drive para desktop (copia temporaria, somente leitura) cruzado com a pasta montada em G: (somente leitura) e com os 64 primeiros bytes de cada arquivo.

## Comparacao com a consulta anterior

| Metrica | Agora | Consulta anterior | Diferenca |
|---|---:|---:|---:|
${rows.join('\n')}

## Nuvem (Drive)

- Arquivos na arvore: ${fmt(t.cloud.filesTotal)} (${GiB(t.cloud.bytesTotal)}), dos quais na lixeira: ${fmt(t.cloud.filesTrashed)} (${GiB(t.cloud.bytesTrashed)}).
- Arquivos ativos: ${fmt(t.cloud.filesActive)} (${fmt(t.cloud.bytesActive)} bytes, ${GiB(t.cloud.bytesActive)}).
- Pastas ativas (contando a raiz): ${fmt(t.cloud.foldersActiveIncludingRoot)}.

## Cruzamento nuvem x disco

- Presentes nos dois lados: ${fmt(t.disk.filesMatched)} arquivos (${fmt(t.disk.bytesMatched)} bytes no disco); com tamanho diferente entre os lados: ${fmt(t.disk.sizeDifferences)}.
- So na nuvem (ativos sem arquivo em G:): ${fmt(t.disk.cloudOnlyFiles)} arquivos, ${fmt(t.disk.cloudOnlyBytes)} bytes.
- So no disco: ${fmt(t.disk.localOnlyFiles)} arquivos, ${fmt(t.disk.localOnlyBytes)} bytes (desktop.ini: ${fmt(t.disk.localOnlyDesktopIni.files)} arquivos, ${fmt(t.disk.localOnlyDesktopIni.bytes)} bytes; outros: ${fmt(t.disk.localOnlyOther.files)} arquivos, ${fmt(t.disk.localOnlyOther.bytes)} bytes); pastas so no disco: ${fmt(t.disk.localOnlyDirs)}.

## Formato real (pelos bytes) dos arquivos ativos

| Formato real | Arquivos | Bytes |
|---|---:|---:|
${t.byRealFormat.map((r) => `| ${r.f} | ${fmt(r.c)} | ${fmt(r.b)} |`).join('\n')}

## Mime de origem registrado no Drive (ativos)

| Mime de origem | Arquivos |
|---|---:|
${t.bySourceMime.map((r) => `| ${r.m} | ${fmt(r.c)} |`).join('\n')}

## Audios e compactados por criterio

- Audios: ${fmt(t.audio.byRealFormat)} pelo formato real, ${fmt(t.audio.bySourceMime)} pelo mime de origem, ${fmt(t.audio.byExtension)} pela extensao.
- Compactados: ${fmt(t.archives.byRealFormat)} pelo formato real, ${fmt(t.archives.bySourceMime)} pelo mime de origem, ${fmt(t.archives.byExtension)} pela extensao; sem extensao .zip: ${fmt(t.archives.withoutExtension)}.

## Divergencias mime/extensao/formato real

- Arquivos com alguma divergencia: ${fmt(t.mismatches.filesWithAny)}.
${Object.entries(t.mismatches.byKind).map(([k, v]) => `- Tipo "${k}": ${fmt(v)}`).join('\n')}
`;
  fs.mkdirSync(docDir, { recursive: true });
  const p = path.join(docDir, `inventario-${stamp}.md`);
  fs.writeFileSync(p, md, 'utf8');
  return p;
}
