import { spawn } from "node:child_process";
import { existsSync,readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Run the emulator and web server from the user's terminal so the user's
// browser can reach them. The only Firebase target is this synthetic project.
const root=path.resolve(import.meta.dirname,"../.."),require=createRequire(import.meta.url);
const localConfig=path.join(root,".preview-tools.local.json");
const config=existsSync(localConfig)?JSON.parse(readFileSync(localConfig,"utf8")):{};
let cli=config.firebaseCli;
if(!cli){try{cli=require.resolve("firebase-tools/lib/bin/firebase.js");}catch{throw Error("Local Firebase emulator tools are missing. Configure .preview-tools.local.json before running the preview.");}}
if(!existsSync(cli))throw Error("The configured Firebase emulator CLI does not exist.");
const env={...process.env,FIREBASE_CLI_DISABLE_TELEMETRY:"1",CI:"true",NEXT_TELEMETRY_DISABLED:"1"};
if(config.javaHome){
  if(!existsSync(path.join(config.javaHome,"bin",process.platform==="win32"?"java.exe":"java")))throw Error("The configured Java runtime does not exist.");
  env.JAVA_HOME=config.javaHome;
  const pathKey=Object.keys(env).find(key=>key.toLowerCase()==="path")??"PATH";
  env[pathKey]=path.join(config.javaHome,"bin")+path.delimiter+(env[pathKey]??"");
}
env.XDG_CONFIG_HOME=config.configHome??path.join(root,".preview-tools","config");
if(config.emulatorCache)env.FIREBASE_EMULATORS_PATH=config.emulatorCache;
delete env.GOOGLE_APPLICATION_CREDENTIALS;
console.log("Starting isolated preview only. Open http://127.0.0.1:3100/preview after Next.js says Ready.");
const child=spawn(process.execPath,[cli,"emulators:exec","--project","demo-alfanar-preview","--only","auth,firestore","--config",path.join(root,"scripts/preview/firebase.json"),"node scripts/preview/seed.mjs && node scripts/preview/start.mjs"],{cwd:root,env,stdio:"inherit"});
child.on("error",error=>{console.error(error.message);process.exitCode=1;});
child.on("exit",code=>{process.exitCode=code??1;});
