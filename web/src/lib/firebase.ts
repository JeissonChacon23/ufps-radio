// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyApQOwd2NPhBQDk8l1aav66ZqEZT3XUnqk",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "radio-37a1a.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "radio-37a1a",
    storageBucket:
        import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "radio-37a1a.firebasestorage.app",
    messagingSenderId:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1063209052779",
    appId:
        import.meta.env.VITE_FIREBASE_APP_ID ||
        "1:1063209052779:web:00515d21ca24c9b99b1f2e",
});

export const auth = getAuth(app);
export const db = getFirestore(app);