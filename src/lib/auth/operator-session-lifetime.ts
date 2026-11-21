export const OPERATOR_SESSION_HOURS=9;
export const OPERATOR_SESSION_MS=OPERATOR_SESSION_HOURS*60*60*1000;
export function operatorSessionExpiry(createdAt:number,storedExpiry:number){
  if(!Number.isSafeInteger(createdAt)||!Number.isSafeInteger(storedExpiry)||createdAt<0||storedExpiry<=createdAt)return 0;
  // Migrate the previous eight-hour lifetime without reviving shorter/revoked sessions.
  const duration=storedExpiry-createdAt,oldLifetime=8*60*60*1000;
  const expiry=duration>=oldLifetime&&duration<oldLifetime+5000?createdAt+OPERATOR_SESSION_MS:storedExpiry;
  return Math.min(expiry,createdAt+OPERATOR_SESSION_MS);
}
