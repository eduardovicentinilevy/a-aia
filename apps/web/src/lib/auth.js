/**
 * Thin wrapper around Firebase Authentication (Google + e-mail/password).
 *
 * The password never touches our API: Firebase handles it and gives the browser an
 * ID token (a signed JWT, valid for 1 hour, renewed automatically). The API verifies
 * that token on every request (apps/api/src/middleware/auth.js).
 *
 * When the VITE_FIREBASE_* variables are empty, login is disabled (development): the API
 * then treats everybody as the local "Dev local" user.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const authEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

/** @type {Promise<{ auth: import('@firebase/auth').Auth, sdk: typeof import('@firebase/auth') }>|null} */
let loading = null;

/** Loads the Firebase SDK on demand (it is not even downloaded when login is disabled). */
function load() {
  loading ??= (async () => {
    const [{ initializeApp }, sdk] = await Promise.all([import('@firebase/app'), import('@firebase/auth')]);
    const auth = sdk.getAuth(initializeApp(firebaseConfig));
    auth.languageCode = 'pt-BR'; // verification and reset e-mails in Portuguese
    return { auth, sdk };
  })();
  return loading;
}

/**
 * @typedef {{ uid: string, email: string|null, displayName: string|null, emailVerified: boolean, photoURL: string|null }} AuthUser
 */

/** @param {import('@firebase/auth').User} user @returns {AuthUser} */
const toAuthUser = (user) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  emailVerified: user.emailVerified,
  photoURL: user.photoURL,
});

/**
 * Calls `callback` with the current user (or null) now and whenever it changes.
 * @param {(user: AuthUser|null) => void} callback
 * @returns {() => void} unsubscribe
 */
export function onUserChange(callback) {
  let unsubscribe = () => {};
  let cancelled = false;
  load().then(({ auth, sdk }) => {
    if (cancelled) return;
    unsubscribe = sdk.onAuthStateChanged(auth, (user) => callback(user ? toAuthUser(user) : null));
  });
  return () => {
    cancelled = true;
    unsubscribe();
  };
}

/** The current ID token (refreshed by Firebase when close to expiring), or null when signed out. */
export async function getIdToken({ forceRefresh = false } = {}) {
  if (!authEnabled) return null;
  const { auth } = await load();
  return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
}

export async function signInWithGoogle() {
  const { auth, sdk } = await load();
  await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider());
}

/** @param {string} email @param {string} password */
export async function signInWithEmail(email, password) {
  const { auth, sdk } = await load();
  await sdk.signInWithEmailAndPassword(auth, email, password);
}

/**
 * Creates an account and sends the verification e-mail (only verified e-mails pass the invite list).
 * @param {string} name @param {string} email @param {string} password
 */
export async function signUpWithEmail(name, email, password) {
  const { auth, sdk } = await load();
  const { user } = await sdk.createUserWithEmailAndPassword(auth, email, password);
  if (name.trim()) await sdk.updateProfile(user, { displayName: name.trim() });
  await sdk.sendEmailVerification(user);
}

export async function resendVerificationEmail() {
  const { auth, sdk } = await load();
  if (auth.currentUser) await sdk.sendEmailVerification(auth.currentUser);
}

/** After the user clicks the link in the e-mail: reload the profile and get a token with email_verified=true. */
export async function refreshVerification() {
  const { auth } = await load();
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser.emailVerified;
}

/** @param {string} email */
export async function sendPasswordReset(email) {
  const { auth, sdk } = await load();
  await sdk.sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  if (!authEnabled) return;
  const { auth, sdk } = await load();
  await sdk.signOut(auth);
}

/** Firebase error codes → messages for the user (PT-BR). */
const AUTH_ERRORS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'Esse e-mail não parece válido.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Tente entrar.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/popup-closed-by-user': 'A janela do Google foi fechada antes de terminar.',
  'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups para este site.',
  'auth/network-request-failed': 'Sem conexão com o Firebase. Confira sua internet.',
};

/** @param {unknown} err */
export function authErrorMessage(err) {
  const code = /** @type {any} */ (err)?.code;
  return AUTH_ERRORS[/** @type {keyof typeof AUTH_ERRORS} */ (code)] ?? 'Não foi possível entrar agora. Tente de novo.';
}
