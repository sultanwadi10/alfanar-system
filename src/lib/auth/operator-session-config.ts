import "server-only";
import { OPERATOR_SESSION_MS } from "./operator-session-lifetime";

export const OPERATOR_SESSION_CONFIG =
  {
    COOKIE_NAME:
      "alfanar_operator_session",

    EXPIRES_IN_MS:
      OPERATOR_SESSION_MS,

    MAX_PIN_ATTEMPTS: 5,

    PIN_LOCK_MS:
      5 * 60 * 1000,
  } as const;
