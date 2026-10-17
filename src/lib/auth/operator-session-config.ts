import "server-only";

export const OPERATOR_SESSION_CONFIG =
  {
    COOKIE_NAME:
      "alfanar_operator_session",

    EXPIRES_IN_MS:
      8 * 60 * 60 * 1000,

    MAX_PIN_ATTEMPTS: 5,

    PIN_LOCK_MS:
      5 * 60 * 1000,
  } as const;