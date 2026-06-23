import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCVfW3vb-oJeArza8Ey_mp_TjIMBV-Gmtg",
  authDomain: "kanoraid-studio.firebaseapp.com",
  projectId: "kanoraid-studio",
  storageBucket: "kanoraid-studio.firebasestorage.app",
  messagingSenderId: "727194214625",
  appId: "1:727194214625:web:ea0c8e42704a90981297a0"
};

// アプリが既に初期化されている場合は既存のインスタンスを使う（二重初期化防止）
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Firestoreも二重初期化を防ぐ
let db;
try {
  db = initializeFirestore(app, {
    localCache: memoryLocalCache()
  });
} catch (e) {
  // 既に初期化済みの場合はgetFirestoreを使う
  db = getFirestore(app);
}
export { db };
