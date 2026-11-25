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
  export const query = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const updateDoc = async () => {}; export const setDoc = async () => {};
  export const initializeFirestore = () => ({}); export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
`;
const stubs = {
  "firebase-firestore.js": firestore,
  "firebase-app.js": "export const initializeApp = () => ({});",
  "firebase-auth.js": "export const getAuth = () => ({});",
};
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("https://www.gstatic.com/firebasejs/")) return { url: "stub:" + specifier.split("/").pop(), shortCircuit: true };
  if (specifier.endsWith("firebase-config.js")) return { url: "stub:firebase-config.js", shortCircuit: true };
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("stub:")) {
    const name = url.slice(5);
    return { format: "module", shortCircuit: true, source: name === "firebase-config.js" ? "export const firebaseConfig = {};" : stubs[name] };
  }
  return next(url, context);
}
