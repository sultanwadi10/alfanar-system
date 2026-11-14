import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseClientAuth } from "@/lib/firebase/client";

export type PasswordResetResult =
  | { success: true }
  | { success: false; message: string };

export async function requestPasswordReset(email: string): Promise<PasswordResetResult> {
  const address = email.trim();
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return { success: false, message: "أدخل بريدًا إلكترونيًا صحيحًا." };
  }
  try {
    const auth = getFirebaseClientAuth();
    auth.languageCode = "ar";
    // Use Firebase's hosted, expiring one-time action link. No login grant,
    // password, token or arbitrary redirect is sent through our server.
    await sendPasswordResetEmail(auth, address);
    return { success: true };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    // Do not reveal whether an account exists, including on older projects
    // where Firebase's email enumeration protection has not been enabled.
    if (code === "auth/user-not-found") return { success: true };
    if (code === "auth/too-many-requests") {
      return { success: false, message: "طلبات كثيرة خلال وقت قصير. حاول لاحقًا." };
    }
    if (code === "auth/network-request-failed") {
      return { success: false, message: "تعذّر الاتصال. تحقق من الإنترنت وحاول مجددًا." };
    }
    if (code === "auth/invalid-email") {
      return { success: false, message: "أدخل بريدًا إلكترونيًا صحيحًا." };
    }
    return { success: false, message: "تعذّر إرسال الرابط. حاول مجددًا لاحقًا." };
  }
}
