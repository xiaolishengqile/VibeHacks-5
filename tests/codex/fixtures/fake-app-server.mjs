import readline from "node:readline";

const input = readline.createInterface({ input: process.stdin });
const waiting = new Map();
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

input.on("line", (line) => {
	const message = JSON.parse(line);
	if (message.id === "approval_1" && Object.hasOwn(message, "result")) {
		const requestId = waiting.get("approval_1");
		waiting.delete("approval_1");
		send({ id: requestId, result: { decision: message.result } });
		return;
	}
	if (message.method === "echo") {
		setTimeout(() => send({ id: message.id, result: message.params }), message.params.value === 1 ? 20 : 0);
		return;
	}
	if (message.method === "askApproval") {
		waiting.set("approval_1", message.id);
		send({ id: "approval_1", method: "item/commandExecution/requestApproval", params: { command: "npm test" } });
		return;
	}
	if (message.method === "push") {
		send({ method: "turn/started", params: { turnId: "turn_1" } });
		return;
	}
	if (message.method === "malformed") {
		process.stdout.write("not-json\n");
		send({ id: message.id, result: { recovered: true } });
		return;
	}
	if (message.method === "fail") {
		send({ id: message.id, error: { code: -32000, message: "模拟失败" } });
		return;
	}
	if (message.method === "diagnostic") {
		process.stderr.write("OPENAI_API_KEY=sk-test-secret-value\nAuthorization: Bearer private-token\n");
		send({ id: message.id, result: { ok: true } });
		return;
	}
	if (message.method === "exit") {
		process.exit(7);
	}
});
