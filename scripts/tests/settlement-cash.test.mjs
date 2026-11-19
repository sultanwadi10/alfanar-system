import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";
function load(file){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../../src/"+file,import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;}
const {cashCount}=load("lib/shifts/cash-count.ts"),{settlementPlan}=load("lib/receivables/settlement-plan.ts"),{shiftTimeSnapshot}=load("lib/shifts/shift-payroll.ts");
test("cash uses exact fils; paper and coin amounts must match, legacy totals keep an unknown split",()=>{
  assert.equal(cashCount({actualCashFils:14250,banknotesFils:10000,coinsFils:4250}).coinsFils,4250);
  assert.equal(cashCount({actualCashFils:0,banknotesFils:0,coinsFils:0}).actualCashFils,0);
  assert.equal(cashCount({actualCashFils:1000}).banknotesFils,null);
  for(const input of [{actualCashFils:-1},{actualCashFils:NaN},{actualCashFils:1000,banknotesFils:1000},{actualCashFils:1000,banknotesFils:1000,coinsFils:1},{actualCashFils:1000,banknotesFils:-1,coinsFils:1001},{actualCashFils:100_000_001}])assert.throws(()=>cashCount(input));
});
test("partial settlement applies oldest selected debt first and never changes unselected balances",()=>{
  const rows=[{id:"old",outstanding:12000},{id:"new",outstanding:6500}];
  const plan=settlementPlan(rows,16000);assert.equal(plan[0].amount,12000);assert.equal(plan[1].amount,4000);assert.equal(plan[1].outstanding,2500);assert.equal(rows[0].outstanding,12000);
  assert.equal(settlementPlan(rows,10000).length,1);
  for(const [r,amount] of [[rows,18501],[rows,0],[rows,0.5],[[rows[0],rows[0]],1000],[[],1],[[{id:"a",outstanding:NaN}],1]])assert.throws(()=>settlementPlan(r,amount));
});
test("manual early morning opening uses today's work date; evening rollover remains dated to its start",()=>{
  const times={morningStart:"08:00",morningEnd:"16:00",eveningStart:"16:00",eveningEnd:"01:00"};
  const early=shiftTimeSnapshot(new Date("2026-11-19T04:30:00Z"),times,"MORNING");assert.equal(early.shiftType,"MORNING");assert.equal(early.workDay,"2026-11-19");
  const overnight=shiftTimeSnapshot(new Date("2026-11-19T21:30:00Z"),times,"EVENING");assert.equal(overnight.shiftType,"EVENING");assert.equal(overnight.workDay,"2026-11-19");
});
