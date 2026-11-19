import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

import { getFirebaseClientEnv } from "@/lib/validation/client-env";

export function getFirebaseClientApp() {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  const env = getFirebaseClientEnv();

  return initializeApp({
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export function getFirebaseClientAuth() {
  const auth = getAuth(getFirebaseClientApp());
  if (process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1") {
    if (process.env.NODE_ENV !== "development" || auth.app.options.projectId !== "demo-alfanar-preview" || !["localhost","127.0.0.1"].includes(window.location.hostname)) throw Error("Preview authentication must stay local");
    if (!auth.emulatorConfig) connectAuthEmulator(auth,"http://127.0.0.1:9099",{disableWarnings:true});
  }
  return auth;
}
