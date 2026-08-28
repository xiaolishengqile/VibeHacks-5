import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootFile = (name: string) => new URL(`../../${name}`, import.meta.url);

test("发布配置只生成苹果芯片应用并排除用户数据", async () => {
	const config = JSON.parse(await readFile(rootFile("electron-packager.json"), "utf8")) as {
		platform: string;
		arch: string;
		name: string;
		appBundleId: string;
		asar: boolean;
		ignore: string[];
		extraResource: string[];
	};
	assert.equal(config.platform, "darwin");
	assert.equal(config.arch, "arm64");
	assert.equal(config.name, "启动日");
	assert.equal(config.appBundleId, "com.startday.desktop");
	assert.equal(config.asar, true);
	assert.ok(config.ignore.some((value) => value.includes("sqlite")));
	assert.ok(config.ignore.some((value) => value.includes("tests")));
	assert.ok(config.ignore.some((value) => value.includes("dist/tests")));
	assert.ok(config.extraResource.includes("build/毛球桌宠.app"));
	assert.ok(config.extraResource.some((value) => value.endsWith("/bin/codex")));
});

test("发布命令包含构建和安装包验证入口", async () => {
	const packageJson = JSON.parse(await readFile(rootFile("package.json"), "utf8")) as {
		scripts: Record<string, string>;
	};
	assert.equal(packageJson.scripts.package, "node scripts/package-desktop.mjs");
	assert.equal(packageJson.scripts["verify:package"], "node scripts/verify-package.mjs");
});
