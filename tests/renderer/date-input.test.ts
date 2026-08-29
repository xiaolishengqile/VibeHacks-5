import assert from "node:assert/strict";
import test from "node:test";
import { localWorkdayDateTimeValue } from "../../src/renderer/date-input.js";

test("周末新增待办时默认推进到下一个工作日", () => {
	assert.equal(localWorkdayDateTimeValue(new Date(2026, 7, 29, 10, 7)), "2026-08-31T10:15");
});
