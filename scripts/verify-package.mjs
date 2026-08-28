import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(projectRoot, "release", "启动日.app");
const host = join(app, "Contents", "MacOS", "启动日");
const codex = join(app, "Contents", "Resources", "codex", "codex");
const codeModeHost = join(app, "Contents", "Resources", "codex", "codex-code-mode-host");
const rg = join(app, "Contents", "Resources", "codex", "rg");
const pet = join(app, "Contents", "Resources", "pet", "毛球桌宠.app", "Contents", "MacOS", "毛球桌宠");

const requiredArchitecture = async (path, label) => {
	const { stdout } = await run("/usr/bin/lipo", ["-archs", path]);
	const architectures = stdout.trim().split(/\s+/);
	if (!architectures.includes("arm64") || architectures.includes("x86_64")) {
		throw new Error(`${label}不是纯苹果芯片程序：${stdout.trim()}`);
	}
};

const files = async (path) => {
	const result = [];
	for (const entry of await readdir(path, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) result.push(join(entry.parentPath, entry.name));
	}
	return result;
};

for (const [path, label] of [[host, "桌面宿主"], [codex, "Codex"], [codeModeHost, "代码模式宿主"], [rg, "文件搜索工具"], [pet, "桌宠"]]) {
	await requiredArchitecture(path, label);
}
const { stdout: bundleId } = await run("/usr/libexec/PlistBuddy", ["-c", "Print:CFBundleIdentifier", join(app, "Contents", "Info.plist")]);
if (bundleId.trim() !== "com.startday.desktop") throw new Error(`应用标识不正确：${bundleId.trim()}`);
const { stdout: version } = await run(codex, ["--version"]);
if (!version.includes("0.150.1")) throw new Error(`Codex 版本不正确：${version.trim()}`);

const packagedFiles = await files(app);
const forbiddenName = /(?:\.sqlite(?:-shm|-wal)?|\.log|\.env(?:\.|$))/i;
const forbiddenPath = /\/(?:tests?|fixtures?|workspaces?)\//i;
const textResource = /(?:\.asar|\.js|\.json|\.html|\.css|\.md|\.txt|\.plist|\.mjs|\.cjs)$/i;
for (const path of packagedFiles) {
	if (forbiddenName.test(path) || forbiddenPath.test(path)) throw new Error(`安装包包含禁止文件：${path}`);
	if (!textResource.test(path)) continue;
	const metadata = await stat(path);
	if (metadata.size > 20 * 1024 * 1024) continue;
	const content = await readFile(path);
	if (/sk-[A-Za-z0-9_-]{20,}/.test(content.toString("latin1"))) {
		throw new Error(`安装包疑似包含接口密钥：${path}`);
	}
}
const { stdout: asarEntries } = await run(join(projectRoot, "node_modules", ".bin", "asar"), [
	"list", join(app, "Contents", "Resources", "app.asar"),
]);
if (/^\/dist\/tests(?:\/|$)/m.test(asarEntries) || /^\/tests(?:\/|$)/m.test(asarEntries)) {
	throw new Error("安装包应用归档包含测试代码");
}
await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
console.log("安装包架构、资源、版本、签名和敏感文件检查通过");
