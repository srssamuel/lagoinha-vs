// Roda os testes do Worker contra o Firestore Emulator com as firestore.rules reais do repo.
// Modelo: scripts/test-rules.mjs da raiz. O emulador exige Java 21+: usa o do PATH, o de JAVA_HOME
// ou o JDK portatil em %LOCALAPPDATA%\Programs\jdk21. A saida de FIRESTORE_EMULATOR_HOST chega ao
// vitest (vitest.config.ts) e liga os testes de contrato; sem ela eles ficam "skipped".
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const env = { ...process.env };

function javaWorks(javaHome) {
  const bin = javaHome ? join(javaHome, 'bin', 'java') : 'java';
  return spawnSync(bin, ['-version'], { env, shell: false }).status === 0;
}

if (!javaWorks(null)) {
  const candidates = [env.JAVA_HOME, env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'jdk21')].filter(Boolean);
  const found = candidates.find((home) => existsSync(join(home, 'bin')) && javaWorks(home));
  if (!found) {
    console.error(
      'Java 21+ nao encontrado. O emulador do Firebase precisa dele: instale um JDK 21 ' +
        '(ex.: Microsoft OpenJDK em %LOCALAPPDATA%\\Programs\\jdk21) ou defina JAVA_HOME.'
    );
    process.exit(1);
  }
  env.JAVA_HOME = found;
  env.PATH = `${join(found, 'bin')}${delimiter}${env.PATH ?? ''}`;
}

// firebase-tools e devDependency da raiz; o firebase.json da raiz ja define o emulador na 8080.
const result = spawnSync(
  'npx',
  [
    'firebase',
    'emulators:exec',
    '--only',
    'firestore',
    '--project',
    'demo-lagoinha-vs',
    '"npm --prefix workers/stems test"'
  ],
  { cwd: repoRoot, env, stdio: 'inherit', shell: true }
);

process.exit(result.status ?? 1);
