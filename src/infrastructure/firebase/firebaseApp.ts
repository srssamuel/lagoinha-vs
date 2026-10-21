import { FirebaseApp, FirebaseOptions, getApps, initializeApp } from 'firebase/app';
import { Auth, connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, Firestore, getFirestore } from 'firebase/firestore';

/** O pedaço de `import.meta.env` com a config pública do app Web (não é segredo; fica fora do git por higiene). */
export interface FirebaseEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_APP_ID?: string;
  /** `host:porta` dos emuladores (ex.: 127.0.0.1:9099 e 127.0.0.1:8080); vazio em produção. */
  VITE_FIREBASE_AUTH_EMULATOR?: string;
  VITE_FIREBASE_FIRESTORE_EMULATOR?: string;
}

export const DEFAULT_PROJECT_ID = 'lagoinha-joao-pessoa';

export function firebaseOptionsFrom(env: FirebaseEnv): FirebaseOptions {
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim() || DEFAULT_PROJECT_ID;
  const apiKey = env.VITE_FIREBASE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('VITE_FIREBASE_API_KEY ausente: copie .env.firebase.example para .env.local e preencha a config pública do app Web.');
  }
  return {
    apiKey,
    projectId,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`,
    appId: env.VITE_FIREBASE_APP_ID?.trim() || undefined
  };
}

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

function splitHost(hostPort: string): [string, number] {
  const [host, port] = hostPort.split(':');
  return [host || '127.0.0.1', Number(port)];
}

/** Uma instância por nome; nos testes cada suíte usa um nome próprio. */
export function connectFirebase(env: FirebaseEnv, name = '[DEFAULT]'): FirebaseHandles {
  const existing = getApps().find((a) => a.name === name);
  const app = existing ?? initializeApp(firebaseOptionsFrom(env), name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (!existing) {
    if (env.VITE_FIREBASE_AUTH_EMULATOR) {
      connectAuthEmulator(auth, `http://${env.VITE_FIREBASE_AUTH_EMULATOR}`, { disableWarnings: true });
    }
    if (env.VITE_FIREBASE_FIRESTORE_EMULATOR) {
      const [host, port] = splitHost(env.VITE_FIREBASE_FIRESTORE_EMULATOR);
      connectFirestoreEmulator(db, host, port);
    }
  }
  return { app, auth, db };
}
