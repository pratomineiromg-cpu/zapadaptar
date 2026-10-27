import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBcwx-yl9i_J1nJldAjjVGb7OC-9O-dOG4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "project-1300957a-ea82-4645-845.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "project-1300957a-ea82-4645-845",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "project-1300957a-ea82-4645-845.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "483558069545",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:483558069545:web:74afce08cd3071e7f6d338"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;