import { spawn } from "node:child_process";
import { configurePreview } from "./env.mjs";
configurePreview();
for(const port of [8080,9099]){try{await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(5000)});}catch{throw Error(`Start local Firebase emulators first (port ${port}). No connection to production is allowed.`);}}
const child=spawn(process.execPath,["node_modules/next/dist/bin/next","dev","--webpack","--hostname","127.0.0.1","--port","3100"],{stdio:"inherit",env:process.env});
if(process.env.PREVIEW_HTTP_CHECK === "1") {
  const check=spawn(process.execPath,["scripts/preview/check-http.mjs"],{stdio:"inherit",env:process.env});
  check.on("exit",code=>{if(code)console.error("Preview HTTP checks failed: "+code);});
}
child.on("exit",code=>process.exit(code??1));
