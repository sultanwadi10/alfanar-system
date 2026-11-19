import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
const code = ts.transpileModule(readFileSync(new URL("../../src/lib/client/share-roster.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function sharing(navigator) {
  const exports = {};
  class ClipboardItem { constructor(values) { this.values = values; } }
  vm.runInNewContext(code, { exports, navigator, DOMException, ClipboardItem });
  return exports;
}
test("text uses the native share sheet or copies the same roster without opening links", async () => {
  let sent, copied;
  assert.equal(await sharing({ share: async value => { sent = value.text; } }).shareRosterText("جدول"), "SHARED");
  assert.equal(sent, "جدول");
  assert.equal(await sharing({ clipboard: { writeText: async value => { copied = value; } } }).shareRosterText("جدول"), "COPIED");
  assert.equal(copied, sent);
});
test("image shares the prepared file or copies PNG bytes; user cancellation has no secondary action", async () => {
  const file = new File(["png"], "roster.png", { type: "image/png" }); let sent, copied = 0;
  assert.equal(await sharing({ canShare: () => true, share: async value => { sent = value.files[0]; } }).shareRosterImage(file), "SHARED");
  assert.equal(sent, file);
  assert.equal(await sharing({ canShare: () => false, clipboard: { write: async values => { assert.equal(values[0].values["image/png"], file); copied++; } } }).shareRosterImage(file), "COPIED");
  assert.equal(copied, 1);
  const cancelled = sharing({ canShare: () => true, share: async () => { throw new DOMException("Cancelled", "AbortError"); }, clipboard: { write: async () => { copied++; } } });
  assert.equal(await cancelled.shareRosterImage(file), "CANCELLED"); assert.equal(copied, 1);
});
