// Firebase: login com Google e Firestore com cache local (funciona offline e sincroniza depois).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  onAuthStateChanged, signOut,
  signInWithEmailAndPassword, EmailAuthProvider, linkWithCredential, updatePassword,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, collection, getDocs, deleteDoc, writeBatch, onSnapshot,
  FieldPath, deleteField, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const DONO = 'lucas.vitor.sena@gmail.com';

export function observarLogin(cb) {
  getRedirectResult(auth).catch(() => {});
  return onAuthStateChanged(auth, cb);
}

// App instalado na tela de início (iPhone/iPad): o login do Google por redirecionamento falha
// (o iOS separa o armazenamento), então ali o caminho é a senha.
export const instalado = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));

export async function entrar() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ login_hint: DONO, prompt: 'select_account' });
  try {
    await signInWithPopup(auth, p);
  } catch (e) {
    if (!instalado && e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
      await signInWithRedirect(auth, p);
    } else throw e;
  }
}

export const entrarComSenha = (senha) => signInWithEmailAndPassword(auth, DONO, senha);

// Cria (ou troca) a senha da mesma conta: mesmo usuário, mesmos dados.
export async function definirSenha(senha) {
  const u = auth.currentUser;
  if (u.providerData.some((p) => p.providerId === 'password')) return updatePassword(u, senha);
  return linkWithCredential(u, EmailAuthProvider.credential(DONO, senha));
}

export const sair = () => signOut(auth);

export async function ler(caminho) {
  const s = await getDoc(doc(db, caminho));
  return s.exists() ? s.data() : null;
}

export async function gravar(caminho, dados) {
  await setDoc(doc(db, caminho), dados);
}

export async function mesclar(caminho, dados) {
  await setDoc(doc(db, caminho), dados, { merge: true });
}

// Grava só os campos que mudaram (ops: [[caminho em partes, valor]] ou {del:true} / {uniao:[...]}).
// Duas máquinas editando campos diferentes, mesmo offline, se somam em vez de uma apagar a outra.
export async function atualizarCampos(caminho, ops) {
  if (!ops.length) return;
  const args = [];
  for (const [partes, v] of ops) {
    const val = v && v.__del ? deleteField() : v && v.__uniao ? arrayUnion(...v.__uniao) : v;
    args.push(new FieldPath(...partes), val);
  }
  for (let i = 0; i < args.length; i += 800) await updateDoc(doc(db, caminho), ...args.slice(i, i + 800));
}

export function ouvir(caminho, cb) {
  return onSnapshot(doc(db, caminho), (s) => cb(s.exists() ? s.data() : null, s.metadata));
}

export async function listar(colecao) {
  const s = await getDocs(collection(db, colecao));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function apagar(caminho) {
  await deleteDoc(doc(db, caminho));
}

// Grava vários documentos de uma vez (até 500 por lote).
export async function gravarVarios(pares) {
  for (let i = 0; i < pares.length; i += 400) {
    const b = writeBatch(db);
    pares.slice(i, i + 400).forEach(([c, d]) => b.set(doc(db, c), d));
    await b.commit();
  }
}
