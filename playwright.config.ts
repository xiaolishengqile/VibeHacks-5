import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "tests/e2e",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 45_000,
	reporter: [["line"]],
	use: { trace: "retain-on-failure" },
});
