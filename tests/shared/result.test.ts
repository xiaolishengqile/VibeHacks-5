import assert from "node:assert/strict";
import test from "node:test";

import { err, ok } from "../../src/shared/result.js";

test("结果类型明确区分成功和失败", () => {
	assert.deepEqual(ok(3), { ok: true, value: 3 });
	assert.deepEqual(err("失败"), { ok: false, error: "失败" });
});
