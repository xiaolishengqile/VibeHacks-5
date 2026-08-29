import { expect, test } from "./fixtures.js";

test("完整工作台切换周时能看到后续日期连续横移", async ({ startDay }) => {
	const calendar = startDay.workbench.locator("#week-calendar");
	await expect(calendar.locator("[data-calendar-track]")).toHaveCount(1);
	await startDay.workbench.getByRole("button", { name: "下一周" }).click();
	const motion = await calendar.evaluate(async (calendar) => {
		const track = calendar.querySelector<HTMLElement>("[data-calendar-track]");
		if (!track) return null;
		const firstTransform = getComputedStyle(track).transform;
		const durations = track.getAnimations().map((animation) => {
			const duration = animation.effect?.getTiming().duration;
			return typeof duration === "number" ? duration : 0;
		});
		await new Promise((resolve) => window.setTimeout(resolve, 80));
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
	expect(motion?.duration).toBeGreaterThanOrEqual(160);
	expect(motion?.duration).toBeLessThanOrEqual(320);
	expect(motion?.laterTransform).not.toBe(motion?.firstTransform);
	await expect.poll(() => calendar.getAttribute("aria-busy")).toBe("false");
});

test("完整工作台拖动日历时可以停在中间日期", async ({ startDay }) => {
	const calendar = startDay.workbench.locator("#week-calendar");
	await expect(calendar.locator("[data-calendar-track]")).toHaveCount(1);
	const box = await calendar.boundingBox();
	if (!box) throw new Error("找不到周日历区域");
	const startX = box.x + box.width * 0.72;
	const endX = startX - box.width * 0.32;
	const y = box.y + box.height * 0.5;

	await startDay.workbench.mouse.move(startX, y);
	await startDay.workbench.mouse.down();
	await startDay.workbench.mouse.move(endX, y, { steps: 8 });
	const dragging = await calendar.evaluate((element) => {
		const track = element.querySelector<HTMLElement>("[data-calendar-track]");
		if (!track) return null;
		return {
			busy: element.getAttribute("aria-busy"),
			panels: track.children.length,
			transform: getComputedStyle(track).transform,
			animations: track.getAnimations().length,
			nextWeekVisible: Array.from(track.querySelectorAll(".calendar-week")).some((week) =>
				week.textContent?.includes("8月31日") && week.textContent.includes("9月1日")),
		};
	});
	expect(dragging).toMatchObject({
		busy: "true",
		panels: 3,
		animations: 0,
		nextWeekVisible: true,
	});
	expect(dragging?.transform).not.toBe("none");

	await startDay.workbench.mouse.up();
	await expect.poll(() => startDay.workbench.locator("#calendar-range").textContent()).toBe("8月26日—9月1日");
});
