import assert from "node:assert/strict";
import test from "node:test";

import { miniPanelWindowOptions, workbenchWindowOptions } from "../../src/desktop/windows.js";

test("桌面窗口禁用渲染进程系统权限", () => {
	const options = workbenchWindowOptions();
	assert.equal(options.show, false);
	assert.equal(options.webPreferences.nodeIntegration, false);
	assert.equal(options.webPreferences.contextIsolation, true);
	assert.equal(options.webPreferences.sandbox, true);
});

test("桌宠轻面板无边框、默认隐藏且保持置顶", () => {
	const options = miniPanelWindowOptions();
	assert.equal(options.frame, false);
	assert.equal(options.show, false);
	assert.equal(options.alwaysOnTop, true);
	assert.equal(options.webPreferences.nodeIntegration, false);
});
