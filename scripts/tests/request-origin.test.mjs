import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../../src/lib/security/has-valid-origin.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function validator(env = {}) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, URL, process: { env } });
  return exports.hasValidOrigin;
}
const publicHost = "alfanar-system--alfanar-system.europe-west4.hosted.app";
function request(origin, host, forwardedHost) {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (host !== null) headers.set("host", host);
  if (forwardedHost !== undefined) headers.set("x-forwarded-host", forwardedHost);
  return new Request("https://internal.run.app/api/store-device/unlock", { headers });
}

test("accepts observed Firebase proxy headers for the exact deployed origin", () => {
  assert.equal(validator()(request(`https://${publicHost}`, "alfanar-system-122723389138.europe-west4.run.app", publicHost)), true);
});
test("preserves direct same-origin local, LAN and HTTPS requests", () => {
  for (const origin of ["http://localhost:3000", "http://192.168.100.15:3000", "https://pocket-calc-eta.vercel.app"]) {
    assert.equal(validator()(request(origin, new URL(origin).host)), true);
  }
});
test("rejects cross-site attempts even with spoofed forwarded hosts", () => {
  const validate = validator();
  for (const evil of ["evil.example", "other-tenant.hosted.app", `${publicHost}.evil.example`]) {
    assert.equal(validate(request(`https://${evil}`, "internal.run.app", evil)), false);
    assert.equal(validate(request(`https://${evil}`, "internal.run.app", publicHost)), false);
  }
});
test("rejects missing, malformed, insecure and ambiguous proxy origins", () => {
  const validate = validator();
  for (const origin of [null, "null", "not-a-url", `http://${publicHost}`, `https://${publicHost}/path`, `https://user@${publicHost}`]) {
    assert.equal(validate(request(origin, "internal.run.app", publicHost)), false);
  }
  assert.equal(validate(request(`https://${publicHost}`, null, publicHost)), false);
  for (const forwarded of [undefined, "evil.example", `${publicHost}, evil.example`]) {
    assert.equal(validate(request(`https://${publicHost}`, "internal.run.app", forwarded)), false);
  }
});
test("accepts only exact configured HTTPS custom origins", () => {
  const validate = validator({ APP_ALLOWED_ORIGINS: "https://alfanar.example.com,*,http://evil.example,https://bad.example/path" });
  assert.equal(validate(request("https://alfanar.example.com", "internal.run.app", "alfanar.example.com")), true);
  for (const origin of ["https://evil.example", "https://bad.example", "https://alfanar.example.com.evil.example"]) {
    assert.equal(validate(request(origin, "internal.run.app", new URL(origin).host)), false);
  }
});
