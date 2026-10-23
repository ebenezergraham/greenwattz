/**
 * The only file that imports the Firebase SDK. It is loaded on demand (dynamic import), so a visitor who never signs in
 * downloads none of it. Email-link sign-in only: no password to keep, and no third-party sign-in script.
 */
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, deleteUser, initializeAuth, isSignInWithEmailLink, onAuthStateChanged, sendSignInLinkToEmail, signInWithEmailLink, signOut } from 'firebase/auth';
import { collection, getDocs, getFirestore, limit, orderBy, query, serverTimestamp, writeBatch, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebase-config';
import type { SaveKind, SavePayload } from './saves';

export interface RemoteUser { uid: string; email: string | null }
export interface RemoteSave { id: string; kind: SaveKind; name: string; dataJson: string; updated: Date | null }

export function createClient() {
  const app = initializeApp(FIREBASE_CONFIG);
  // initializeAuth with only local persistence keeps the pop-up sign-in code, and its extra scripts, out of the page.
  const auth = initializeAuth(app, { persistence: browserLocalPersistence });
  const db = getFirestore(app);
  const saves = (uid: string) => collection(db, 'users', uid, 'saves');

  return {
    onUser(cb: (u: RemoteUser | null) => void) {
      return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null));
    },
    sendLink: (email: string, url: string) => sendSignInLinkToEmail(auth, email, { url, handleCodeInApp: true }),
    isLink: (href: string) => isSignInWithEmailLink(auth, href),
    completeLink: (email: string, href: string) => signInWithEmailLink(auth, email, href),
    signOut: () => signOut(auth),
    async list(uid: string): Promise<RemoteSave[]> {
      const snap = await getDocs(query(saves(uid), orderBy('updatedAt', 'desc'), limit(50)));
      return snap.docs.map((d) => {
        const v = d.data() as { kind?: string; name?: string; dataJson?: string; updatedAt?: { toDate(): Date } | null };
        return { id: d.id, kind: v.kind === 'quotes' ? 'quotes' : 'plan', name: String(v.name ?? ''), dataJson: String(v.dataJson ?? ''), updated: v.updatedAt?.toDate ? v.updatedAt.toDate() : null };
      });
    },
    async add(uid: string, p: SavePayload) {
      await addDoc(saves(uid), { kind: p.kind, name: p.name, dataJson: p.dataJson, updatedAt: serverTimestamp() });
    },
    remove: (uid: string, id: string) => deleteDoc(doc(db, 'users', uid, 'saves', id)),
    /** Delete every save, then the sign-in record. */
    async deleteEverything(uid: string) {
      for (;;) {
        const snap = await getDocs(query(saves(uid), limit(400)));
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      if (auth.currentUser) await deleteUser(auth.currentUser);
    },
  };
}

export type Client = ReturnType<typeof createClient>;
