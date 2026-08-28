import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const pidFile = process.argv[2];
if (!pidFile) process.exit(2);
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
	stdio: "ignore",
});
await writeFile(pidFile, String(child.pid), "utf8");
process.stdin.resume();
