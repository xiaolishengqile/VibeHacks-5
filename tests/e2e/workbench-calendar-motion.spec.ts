import { expect, test } from "./fixtures.js";

test("完整工作台切换周时能看到后续日期连续横移", async ({ startDay }) => {
	await startDay.workbench.getByRole("button", { name: "下一周" }).click();
	const motion = await startDay.workbench.locator("#week-calendar").evaluate(async (calendar) => {
		const track = calendar.querySelector<HTMLElement>("[data-calendar-track]");
		if (!track) return null;
		const firstTransform = getComputedStyle(track).transform;
		const durations = track.getAnimations().map((animation) => {
			const duration = animation.effect?.getTiming().duration;
			return typeof duration === "number" ? duration : 0;
		});
		await new Promise((resolve) => window.setTimeout(resolve, 160));
		return {
			busy: calendar.getAttribute("aria-busy"),
			panels: track.children.length,
			duration: Math.max(0, ...durations),
			firstTransform,
			laterTransform: getComputedStyle(track).transform,
			nextWeekVisible: Array.from(track.querySelectorAll(".calendar-week")).some((week) =>
				week.textContent?.includes("8月31日") && week.textContent.includes("9月6日")),
		};
	});

	expect(motion).toMatchObject({
		busy: "true",
		panels: 3,
		nextWeekVisible: true,
	});
	expect(motion?.duration).toBeGreaterThanOrEqual(480);
	expect(motion?.laterTransform).not.toBe(motion?.firstTransform);
	await expect.poll(() => startDay.workbench.locator("#week-calendar").getAttribute("aria-busy")).toBe("false");
});
