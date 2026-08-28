import assert from "node:assert/strict";
import test from "node:test";

import { runCoreDemo } from "../../src/demo/core-demo.js";

test("季度复盘演示完成建图、重排和解释", async () => {
	const summary = await runCoreDemo(":memory:");
	assert.deepEqual(summary.nodeTitles, [
		"找协作方拿数据",
		"搭建复盘框架",
		"完成数据分析",
		"生成汇报材料",
		"老板审核",
	]);
	assert.equal(summary.changedOwner, "小赵");
	assert.match(summary.topReason, /等待|审核/);
});
