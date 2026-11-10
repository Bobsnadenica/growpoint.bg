import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const file = "public/maintenance.txt";
const value = (await readFile(file, "utf8")).trim();
if (!["0", "1"].includes(value)) throw new Error("maintenance.txt must contain only 0 (normal site) or 1 (coming soon).");
const output = async name => (await run("terraform", ["-chdir=infra/terraform", "output", "-raw", name])).stdout.trim();
const [bucket, distribution] = await Promise.all([output("frontend_bucket_name"), output("frontend_cloudfront_distribution_id")]);
if (!bucket || !distribution) throw new Error("Production hosting outputs are missing.");
await run("aws", ["s3", "cp", file, `s3://${bucket}/maintenance.txt`, "--cache-control", "no-cache, no-store, must-revalidate", "--content-type", "text/plain; charset=utf-8"]);
const result = await run("aws", ["cloudfront", "create-invalidation", "--distribution-id", distribution, "--paths", "/maintenance.txt", "--query", "Invalidation.Id", "--output", "text"]);
console.log(`Coming-soon mode: ${value === "1" ? "ON" : "OFF"}. Published only maintenance.txt. Invalidation: ${result.stdout.trim()}. New loads read it immediately; open tabs recheck within 60 seconds or on focus.`);
