// Sobe os emuladores do Firestore e do Storage, roda tests/rules e derruba tudo no fim.
// O emulador exige Java 21+: usa o do PATH, o de JAVA_HOME ou o JDK portatil em %LOCALAPPDATA%\Programs\jdk21.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const env = { ...process.env };

function javaWorks(javaHome) {
  const bin = javaHome ? join(javaHome, 'bin', 'java') : 'java';
  const probe = spawnSync(bin, ['-version'], { env, shell: false });
  return probe.status === 0;
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

// Projeto "demo-*": o emulador roda sem credencial e sem tocar no projeto real.
const result = spawnSync(
  'npx',
  [
    'firebase',
    'emulators:exec',
    '--only',
    'firestore,storage',
    '--project',
    'demo-lagoinha-vs',
    '"npx vitest run -c vitest.rules.config.ts"'
  ],
  { env, stdio: 'inherit', shell: true }
);

process.exit(result.status ?? 1);
