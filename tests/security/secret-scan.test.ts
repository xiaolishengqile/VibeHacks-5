import assert from "node:assert/strict";
import test from "node:test";

import { redactSecrets } from "../../src/codex/jsonrpc-transport.js";

test("常见密钥和授权头写入诊断前会被清除", () => {
	const raw = [
		"OPENAI_API_KEY=sk-test-secret-value",
		"Authorization: Bearer private-token",
		"x-api-key: private-api-secret",
		'"api_key":"private-json-secret"',
	].join("\n");
	const redacted = redactSecrets(raw);

	assert.doesNotMatch(redacted, /test-secret|private-token|private-api-secret|private-json-secret/);
	assert.match(redacted, /已隐藏/);
});
