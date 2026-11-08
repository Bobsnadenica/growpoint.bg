// Isolated database integration gate. The SDK fixtures use loopback and dummy
// credentials only; no AWS table, production identity or bank is contacted.
import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {homedir} from "node:os";
import {dirname,resolve} from "node:path";
import net from "node:net";
const jar=resolve(process.env.GP_DYNAMODB_LOCAL_JAR || `${homedir()}/.cache/growpoint-dynamodb-local/DynamoDBLocal.jar`);
if(!existsSync(jar))throw Error("Install the official AWS DynamoDB Local JAR first; see docs/billing-integration.md.");
const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once("error",reject);probe.listen(0,"127.0.0.1",resolve);});
const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const server=spawn("java",[`-Djava.library.path=${dirname(jar)}/DynamoDBLocal_lib`,"-jar",jar,"-inMemory","-sharedDb","-port",String(port),"-disableTelemetry"],{cwd:dirname(jar),stdio:"ignore"});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
  let ready=false;
  for(let attempt=0;attempt<150;attempt++) {
    if(server.exitCode!==null)throw Error("DynamoDB Local stopped before startup.");
    ready=await new Promise(resolve=>{const socket=net.connect(port,"127.0.0.1");socket.once("connect",()=>{socket.destroy();resolve(true);});socket.once("error",()=>resolve(false));});
    if(ready)break;await sleep(100);
  }
  if(!ready)throw Error("DynamoDB Local did not start within 15 seconds.");
  const tests=spawn(process.execPath,["--test","tests/billing-local.integration.cjs"],{stdio:"inherit",env:{...process.env,GP_BILLING_TEST_PORT:String(port)}});
  process.exitCode=await new Promise((resolve,reject)=>{tests.once("error",reject);tests.once("exit",code=>resolve(code ?? 1));});
} finally {server.kill("SIGTERM");}
