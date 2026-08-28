import assert from "node:assert/strict";
import test from "node:test";

import { miniPanelWindowOptions, showMiniPanelNearPet, workbenchWindowOptions } from "../../src/desktop/windows.js";

test("桌面窗口禁用渲染进程系统权限", () => {
	const options = workbenchWindowOptions();
	assert.equal(options.show, false);
	assert.equal(options.webPreferences.nodeIntegration, false);
	assert.equal(options.webPreferences.contextIsolation, true);
	assert.equal(options.webPreferences.sandbox, true);
	assert.match(options.webPreferences.preload ?? "", /preload\.cjs$/);
});

test("桌宠轻面板无边框、默认隐藏且保持置顶", () => {
	const options = miniPanelWindowOptions();
	assert.equal(options.frame, false);
	assert.equal(options.show, false);
	assert.equal(options.alwaysOnTop, true);
	assert.equal(options.webPreferences.nodeIntegration, false);
});

test("轻面板靠近右下角桌宠且不会超出工作区", () => {
	let position = { x: -1, y: -1 };
	let shown = false;
	showMiniPanelNearPet({
		getBounds: () => ({ x: 0, y: 0, width: 420, height: 560 }),
		setPosition: (x, y) => { position = { x, y }; },
		show: () => { shown = true; },
		focus: () => {},
	}, { x: 0, y: 0, width: 1440, height: 900 }, "bottomRight");

	assert.deepEqual(position, { x: 744, y: 340 });
	assert.equal(shown, true);
});
