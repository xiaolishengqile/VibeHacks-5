import assert from "node:assert/strict";
import test from "node:test";

import { isSubmitDisabled, renderEmpty, setText } from "../../src/renderer/dom.js";

const fakeElement = () => ({ textContent: "", innerHTML: "" });

test("用户输入作为文本渲染而不是插入网页标记", () => {
	const target = fakeElement();
	setText(target, "<img src=x onerror=alert(1)>");
	assert.equal(target.textContent, "<img src=x onerror=alert(1)>");
	assert.equal(target.innerHTML, "");
});

test("空数据使用明确的中文占位状态", () => {
	const target = fakeElement();
	renderEmpty(target, "正在加载工作计划");
	assert.equal(target.textContent, "正在加载工作计划");
});

test("轻面板输入为空时不能提交", () => {
	assert.equal(isSubmitDisabled("\n  ", false), true);
	assert.equal(isSubmitDisabled("完成季度复盘", false), false);
	assert.equal(isSubmitDisabled("完成季度复盘", true), true);
});
