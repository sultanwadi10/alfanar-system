export const PREVIEW_PROJECT = "demo-alfanar-preview";
export function requireLocalPreview() {
  if (process.env.LOCAL_PREVIEW !== "1") return false;
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PREVIEW_PROJECT || process.env.FIREBASE_ADMIN_PROJECT_ID !== PREVIEW_PROJECT || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") throw Error("Local preview requires the isolated demo project and both loopback emulators");
  return true;
}
