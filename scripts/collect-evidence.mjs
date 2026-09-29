import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const now = new Date();
const dateTag = now.toISOString().replace(/[:.]/g,"_").slice(0,19)+"Z";
const evidenceDir = path.join(ROOT,"docs","evidence",dateTag);
fs.mkdirSync(evidenceDir,{recursive:true});
function run(cmd,opts={}){
  try{return execSync(cmd,{cwd:ROOT,encoding:"utf8",timeout:300000,...opts});}
  catch(e){return "[FAILED]\nexit:"+e.status+"\n"+(e.stdout||"")+(e.stderr||"");}
}
const HEAD=run("git rev-parse HEAD").trim();
function header(l){return "# "+l+"\n# Collected: "+now.toISOString()+"\n# HEAD: "+HEAD+"\n\n";}
function write(n,c){fs.writeFileSync(path.join(evidenceDir,n),c,"utf8");console.log(" wrote "+n+" ("+c.length+" chars)");}
console.log("\nCollecting -> "+evidenceDir+"\n");
write("git-head.txt",header("git-head")+run("git rev-parse HEAD")+"\n"+run("git status -sb")+"\n"+run("git log --oneline --graph -25"));
write("tree.txt",header("git ls-files")+run("git ls-files"));
console.log(" running vitest...");
write("vitest.txt",header("vitest")+run("npx vitest run --reporter=verbose",{env:{...process.env,FORCE_COLOR:"0"}}));
console.log(" running check:provenance...");
write("provenance.txt",header("check:provenance")+run("npm run check:provenance",{env:{...process.env,FORCE_COLOR:"0"}}));
console.log(" running build...");
write("build.txt",header("npm run build")+run("npm run build",{env:{...process.env,FORCE_COLOR:"0"}}));
const distGrep=run("powershell -Command \"Get-ChildItem dist/assets/*.js | Select-String -Pattern '__maplibreInstance','__SIMULORAN_E2E__','__LORAN_E2E__' | ForEach-Object { $_.Filename+': '+$_.Line.Trim().Substring(0,[Math]::Min(120,$_.Line.Length)) }; Write-Host 'dist-grep done'\"");
write("dist-grep.txt",header("dist hook grep")+distGrep);
write("versions.txt",header("versions")+"node: "+run("node --version").trim()+"\nnpm: "+run("npm --version").trim()+"\nvite: "+JSON.parse(fs.readFileSync(path.join(ROOT,"node_modules/vite/package.json"),"utf8")).version+"\nmaplibre-gl: "+JSON.parse(fs.readFileSync(path.join(ROOT,"node_modules/maplibre-gl/package.json"),"utf8")).version+"\n@playwright/test: "+JSON.parse(fs.readFileSync(path.join(ROOT,"node_modules/@playwright/test/package.json"),"utf8")).version+"\nvitest: "+JSON.parse(fs.readFileSync(path.join(ROOT,"node_modules/vitest/package.json"),"utf8")).version+"\n");
console.log("\nDone. Files:");
for(const f of fs.readdirSync(evidenceDir)){const s=fs.statSync(path.join(evidenceDir,f));console.log("  "+f.padEnd(24)+" "+s.size+" bytes");}