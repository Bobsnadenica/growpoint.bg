import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function run(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024 * 16,
    ...options
  });
  if (stderr?.trim()) {
    process.stderr.write(stderr);
  }
  return stdout.trim();
}

async function terraformOutput(name) {
  try {
    return await run("terraform", ["-chdir=infra/terraform", "output", "-raw", name]);
  } catch (error) {
    throw new Error(
      `Could not read Terraform output "${name}". Run "terraform -chdir=infra/terraform apply" first.`
    );
  }
}

async function main() {
  const [bucketName, distributionId, distributionDomain] = await Promise.all([
    terraformOutput("frontend_bucket_name"),
    terraformOutput("frontend_cloudfront_distribution_id"),
    terraformOutput("frontend_cloudfront_domain_name")
  ]);

  if (!bucketName || !distributionId || !distributionDomain) {
    throw new Error(
      "Frontend hosting outputs are empty. Set frontend_hosting_enabled=true and apply Terraform first."
    );
  }

  console.log("[cloudfront] Building frontend dist...");
  await run("npm", ["run", "build:cloudfront"]);

  console.log(`[cloudfront] Syncing HTML and public files to s3://${bucketName}...`);
  await run("aws", [
    "s3",
    "sync",
    "dist",
    `s3://${bucketName}`,
    "--delete",
    "--exclude",
    "assets/*",
    "--cache-control",
    "no-cache, no-store, must-revalidate"
  ]);

  console.log(`[cloudfront] Syncing immutable assets to s3://${bucketName}/assets...`);
  await run("aws", [
    "s3",
    "sync",
    "dist/assets",
    `s3://${bucketName}/assets`,
    "--delete",
    "--cache-control",
    "public, max-age=31536000, immutable"
  ]);

  console.log(`[cloudfront] Invalidating ${distributionId}...`);
  await run("aws", [
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    "/index.html",
    "/404.html",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.json",
    "/favicon.svg",
    "/consultants*",
    "/users*",
    "/auth*",
    "/dashboard*",
    "/admin*",
    "/account*",
    "/about*",
    "/faq*",
    "/contact*",
    "/legal*"
  ]);

  console.log(`[cloudfront] Deployed: https://${distributionDomain}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
