import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { test } from "node:test";
const root=path.resolve(import.meta.dirname,"../../src"),cache=new Map();
function load(file){if(cache.has(file))return cache.get(file);const exports={},source=readFileSync(path.join(root,file),"utf8"),require=name=>load(name.startsWith("@/")?name.slice(2)+".ts":path.relative(root,path.resolve(root,path.dirname(file),name+".ts")));vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require});cache.set(file,exports);return exports;}
const {suggestShiftType}=load("lib/shifts/shift-selection.ts"),{emptyRosterSchedule}=load("lib/employees/roster-week.ts");
const settings={morningStart:"08:00",morningEnd:"16:05",eveningStart:"16:08",eveningEnd:"01:00"},empty=emptyRosterSchedule(),at=new Date("2026-11-19T13:01:13.368Z");
test("16:01 evening employee is evening even though the advisory morning ends at 16:05",()=>{const result=suggestShiftType(at,settings,{...empty,thursday:["EVENING"]});assert.equal(result.type,"EVENING");assert.equal(result.source,"AUTO_SCHEDULE");});
test("recent morning handover suggests evening for a staff member without a single roster assignment",()=>{for(const schedule of [empty,{...empty,thursday:["MORNING","EVENING"]}]){const result=suggestShiftType(at,settings,schedule,{type:"MORNING",workDay:"2026-11-19",closedAt:new Date("2026-11-19T13:00:45.537Z")});assert.equal(result.type,"EVENING");assert.equal(result.source,"AUTO_HANDOVER");}});
test("old or future handover records do not override the clock",()=>{for(const previous of [{type:"MORNING",workDay:"2026-11-18",closedAt:new Date("2026-11-18T13:00:00Z")},{type:"MORNING",workDay:"2026-11-19",closedAt:new Date("2026-11-19T14:00:00Z")}])assert.equal(suggestShiftType(at,settings,empty,previous).source,"AUTO_CLOCK");});
test("gap before evening opening chooses the nearest upcoming shift without blocking entry",()=>{assert.equal(suggestShiftType(new Date("2026-11-19T13:06:00Z"),settings,empty).type,"EVENING");assert.equal(suggestShiftType(new Date("2026-11-19T04:30:00Z"),settings,empty).type,"MORNING");});
test("after midnight uses the roster of the evening shift's starting day",()=>{const result=suggestShiftType(new Date("2026-11-19T21:30:00Z"),settings,{...empty,thursday:["EVENING"],friday:["MORNING"]});assert.equal(result.type,"EVENING");assert.equal(result.source,"AUTO_SCHEDULE");});
test("overnight clock prevents a recent evening handover from suggesting tomorrow morning",()=>{const result=suggestShiftType(new Date("2026-11-20T21:22:00Z"),settings,empty,{type:"EVENING",workDay:"2026-11-20",closedAt:new Date("2026-11-20T21:14:00Z")});assert.equal(result.type,"EVENING");assert.equal(result.source,"AUTO_CLOCK");});
