// Mengganti modul Firebase (CDN) dengan stub agar lapisan penulisan (ledger.js) dapat dijalankan di Node.
const firestore = `
  const mk = (path) => ({ path });
  let n = 0;
  export const collection = (_db, ...seg) => mk(seg.join("/"));
  export const doc = (a, ...seg) => {
    if (a && a.path !== undefined) return mk(seg.length ? a.path + "/" + seg[0] : a.path + "/auto" + (++n));
    return mk(seg.join("/"));
  };
  export const serverTimestamp = () => "__TS__";
  export const writeBatch = () => { const ops = [];
    return { ops, set: (r, d) => ops.push(["set", r.path, d]), update: (r, d) => ops.push(["update", r.path, d]),
      delete: (r) => ops.push(["delete", r.path]), commit: async () => globalThis.__commit(ops) }; };
  export const getDoc = async (r) => globalThis.__getDoc ? globalThis.__getDoc(r.path) : { exists: () => false };
  export const onSnapshot = () => () => {};
  export const query = () => ({}); export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const updateDoc = async (r, d) => (globalThis.__updateDoc ? globalThis.__updateDoc(r.path, d) : undefined);
  export const setDoc = async (r, d) => (globalThis.__setDoc ? globalThis.__setDoc(r.path, d) : undefined); export const deleteDoc = async () => {};
  export const initializeFirestore = () => ({}); export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
`;
const stubs = {
  "firebase-firestore.js": firestore,
  "firebase-app.js": "export const initializeApp = () => ({});",
  "firebase-auth.js": "export const getAuth = () => ({}); export const updateProfile = async () => {}; export const createUserWithEmailAndPassword = async (a, e) => ({ user: { uid: 'new1', email: e } }); export const signInWithEmailAndPassword = async () => ({}); export const signOut = async () => {}; export const sendPasswordResetEmail = async () => {}; export const sendEmailVerification = async () => {}; export const onAuthStateChanged = () => () => {};",
  "firebase-messaging.js": "export const getMessaging = () => ({}); export const getToken = async () => 't'; export const deleteToken = async () => true; export const isSupported = async () => false;",
};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("https://www.gstatic.com/firebasejs/")) return { url: "stub:" + specifier.split("/").pop(), shortCircuit: true };
  if (specifier.endsWith("firebase-config.js")) return { url: "stub:firebase-config.js", shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("stub:")) {
    const name = url.slice(5);
    return { format: "module", shortCircuit: true, source: name === "firebase-config.js" ? "export const firebaseConfig = {}; export const vapidKey = \"\";" : stubs[name] };
  }
  return next(url, context);
}
