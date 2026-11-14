import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function compile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const helperSource = compile("../../src/lib/client/password-reset.ts");
function helper({ failure, initFailure } = {}) {
  const calls = [], auth = {}, exports = {};
  vm.runInNewContext(helperSource, { exports, require(name) {
    if (name === "firebase/auth") return { async sendPasswordResetEmail(...args) {
      calls.push(args);
      if (failure) throw failure;
    } };
    if (name === "@/lib/firebase/client") return { getFirebaseClientAuth() {
      if (initFailure) throw initFailure;
      return auth;
    } };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { request: exports.requestPasswordReset, calls, auth };
}

test("sends reset mail to normalized email with Arabic and no custom redirect or credentials", async () => {
  const h = helper();
  assert.equal((await h.request(" owner@example.com ")).success, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].length, 2);
  assert.equal(h.calls[0][0], h.auth);
  assert.equal(h.calls[0][1], "owner@example.com");
  assert.equal(h.auth.languageCode, "ar");
});
test("invalid and oversized addresses never call Firebase", async () => {
  const h = helper();
  for (const email of ["", " ", "bad", "a@b", "a b@example.com", "x".repeat(255) + "@example.com"]) {
    assert.equal((await h.request(email)).success, false);
  }
  assert.equal(h.calls.length, 0);
});
test("unknown account and existing account return identical successful result", async () => {
  const existing = await helper().request("owner@example.com");
  const missing = await helper({ failure: { code: "auth/user-not-found", message: "private" } }).request("missing@example.com");
  assert.equal(JSON.stringify(existing), JSON.stringify(missing));
});
test("provider rate limit, network failure and invalid email produce safe Arabic messages", async () => {
  for (const code of ["auth/too-many-requests", "auth/network-request-failed", "auth/invalid-email", "unknown"]) {
    const result = await helper({ failure: { code, message: "secret-raw-error" } }).request("owner@example.com");
    assert.equal(result.success, false);
    assert.match(result.message, /[\u0600-\u06ff]/);
    assert.doesNotMatch(result.message, /secret-raw-error|auth\//);
  }
  assert.equal((await helper({ initFailure: Error("secret-config") }).request("owner@example.com")).success, false);
});

const componentSource = compile("../../src/app/(auth)/login/password-reset-form.tsx");
function ui(target, send) {
  const states = [], exports = {};
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  vm.runInNewContext(componentSource, { exports, require(name) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (name === "react") return {
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = value; }];
      },
      useRef(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = { current: initial };
        return states[i];
      },
    };
    if (name === "@/lib/client/password-reset") return { requestPasswordReset: send };
    if (name === "./login.module.css") return { default: new Proxy({}, { get: (_, name) => name }) };
    throw Error(`Unexpected dependency ${name}`);
  } });
  const back = [];
  function render() {
    cursor = 0;
    return exports.PasswordResetForm({ initialEmail: "owner@example.com", target, onBack: email => back.push(email) });
  }
  return { render, back };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
}
const find = (tree, predicate) => nodes(tree).find(predicate);
test("both login targets show email-only reset form and return without submitting", () => {
  for (const target of ["admin", "store"]) {
    const u = ui(target, () => assert.fail("unexpected email"));
    const tree = u.render();
    assert.equal(find(tree, n => n.type === "input").props.type, "email");
    assert.equal(nodes(tree).filter(n => n.type === "input").length, 1);
    const back = find(tree, n => n.type === "button" && n.props.type === "button");
    back.props.onClick();
    assert.equal(u.back[0], "owner@example.com");
    assert.ok(find(tree, n => n.type === "span" && n.props.children === (target === "admin" ? "الإدارة" : "المحل")));
  }
});
test("rapid double submit sends once, shows status, and prevents repeat send", async () => {
  let finish, count = 0;
  const u = ui("admin", () => { count++; return new Promise(resolve => { finish = resolve; }); });
  const form = find(u.render(), n => n.type === "form");
  const first = form.props.onSubmit({ preventDefault() {} });
  await form.props.onSubmit({ preventDefault() {} });
  assert.equal(count, 1);
  assert.equal(find(u.render(), n => n.type === "input").props.disabled, true);
  finish({ success: true });
  await first;
  const tree = u.render();
  assert.ok(find(tree, n => n.props.role === "status"));
  assert.equal(find(tree, n => n.type === "button" && n.props.type === "submit").props.disabled, true);
  await find(tree, n => n.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(count, 1);
});
test("failed send remains retryable and edited email clears old feedback", async () => {
  const u = ui("store", async () => ({ success: false, message: "تحقق من الإنترنت" }));
  await find(u.render(), n => n.type === "form").props.onSubmit({ preventDefault() {} });
  let tree = u.render();
  assert.equal(find(tree, n => n.props.role === "alert").props.children, "تحقق من الإنترنت");
  assert.equal(find(tree, n => n.type === "button" && n.props.type === "submit").props.disabled, false);
  find(tree, n => n.type === "input").props.onChange({ target: { value: "new@example.com" } });
  tree = u.render();
  assert.equal(find(tree, n => n.props.role === "alert"), undefined);
  assert.equal(find(tree, n => n.type === "input").props.value, "new@example.com");
});
