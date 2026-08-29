import { execFile } from "node:child_process";
import { access, chmod, cp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { packager } from "@electron/packager";

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(projectRoot, "electron-packager.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const releaseRoot = join(projectRoot, "release");
const stagingRoot = join(releaseRoot, ".staging");
const finalApp = join(releaseRoot, "启动日.app");
const godot = "/Applications/Godot.app/Contents/MacOS/Godot";
const petApp = join(projectRoot, "build", "毛球桌宠.app");
const vendorRoot = join(projectRoot, "node_modules", "@openai", "codex-darwin-arm64", "vendor", "aarch64-apple-darwin");
const codexBinary = join(vendorRoot, "bin", "codex");

const assertReleaseTarget = () => {
	if (dirname(releaseRoot) !== projectRoot || releaseRoot === projectRoot) {
		throw new Error("发布目录校验失败");
	}
};

const executable = async (path, label) => {
	try { await access(path, constants.X_OK); }
	catch { throw new Error(`${label}不可执行：${path}`); }
};

assertReleaseTarget();
await executable(godot, "Godot");
await executable(codexBinary, "Codex");
await run(join(projectRoot, "scripts", "export.command"), [], { cwd: projectRoot });
const petExecutable = join(petApp, "Contents", "MacOS", "毛球桌宠");
const petArm64 = `${petExecutable}.arm64`;
const { stdout: petArchitectures } = await run("/usr/bin/lipo", ["-archs", petExecutable]);
if (petArchitectures.trim().split(/\s+/).includes("x86_64")) {
	await run("/usr/bin/lipo", [petExecutable, "-thin", "arm64", "-output", petArm64]);
	await rename(petArm64, petExecutable);
}
await chmod(petExecutable, 0o755);
await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", petApp]);
await run(join(projectRoot, "tests", "test_export_app.command"), [], { cwd: projectRoot });
await run("npm", ["run", "build:desktop"], { cwd: projectRoot });

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(stagingRoot, { recursive: true });
const outputPaths = await packager({
	dir: projectRoot,
	name: config.name,
	platform: config.platform,
	arch: config.arch,
	appBundleId: config.appBundleId,
	asar: config.asar,
	prune: config.prune,
	overwrite: true,
	out: stagingRoot,
	ignore: config.ignore.map((pattern) => new RegExp(pattern)),
});
const packagedApp = outputPaths.map((path) => join(path, "启动日.app")).find((path) => path.endsWith(".app"));
if (!packagedApp) throw new Error("桌面宿主打包结果不存在");

const resources = join(packagedApp, "Contents", "Resources");
const packagedPet = join(resources, "pet", "毛球桌宠.app");
const packagedCodex = join(resources, "codex");
await mkdir(dirname(packagedPet), { recursive: true });
await cp(petApp, packagedPet, { recursive: true, preserveTimestamps: true });
await mkdir(packagedCodex, { recursive: true });
await Promise.all([
	cp(codexBinary, join(packagedCodex, "codex")),
	cp(join(vendorRoot, "bin", "codex-code-mode-host"), join(packagedCodex, "codex-code-mode-host")),
	cp(join(vendorRoot, "codex-path", "rg"), join(packagedCodex, "rg")),
]);
await Promise.all(["codex", "codex-code-mode-host", "rg"].map((name) => chmod(join(packagedCodex, name), 0o755)));
await rename(packagedApp, finalApp);
await rm(stagingRoot, { recursive: true, force: true });
await run("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", finalApp]);
console.log(`苹果芯片应用已生成：${finalApp}`);
