export const AUTH_SESSION_CONFIG = {
  ADMIN_EXPIRES_IN_MS: 8 * 60 * 60 * 1000,
  STORE_EXPIRES_IN_MS: 16 * 60 * 60 * 1000,
  RECENT_SIGN_IN_MAX_AGE_SECONDS: 5 * 60,

  COOKIE_NAMES: {
    ADMIN: "alfanar_admin_session",
    STORE: "alfanar_store_session",
  },
} as const;