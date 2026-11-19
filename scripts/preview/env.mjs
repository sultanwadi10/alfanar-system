export function configurePreview() {
  const env={LOCAL_PREVIEW:"1",NEXT_PUBLIC_LOCAL_PREVIEW:"1",FIREBASE_ADMIN_PROJECT_ID:"demo-alfanar-preview",NEXT_PUBLIC_FIREBASE_PROJECT_ID:"demo-alfanar-preview",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",NEXT_PUBLIC_FIREBASE_API_KEY:"demo-preview-key",NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:"demo-alfanar-preview.firebaseapp.com",NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:"demo-alfanar-preview.appspot.com",NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:"123456789",NEXT_PUBLIC_FIREBASE_APP_ID:"1:123456789:web:preview",FIREBASE_ADMIN_CLIENT_EMAIL:"preview@demo-alfanar-preview.iam.gserviceaccount.com",FIREBASE_ADMIN_PRIVATE_KEY:"unused-emulator-only",EMPLOYEE_PIN_PEPPER:"preview-only-".repeat(8),ADMIN_STEALTH_UNLOCK_CODE:"123456789012",STORE_STEALTH_UNLOCK_CODE:"1234567890"};
  Object.assign(process.env,env);
  // Prevent accidental credential fallback in this process or its children.
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  return env;
}
