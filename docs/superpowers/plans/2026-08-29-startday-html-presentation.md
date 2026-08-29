# 启动日交互式网页演示实施计划

> **供执行者使用：** 必须使用测试优先开发流程逐项实施。每一步使用复选框跟踪。

**目标：** 交付一套可离线播放、可压缩上传、包含 11 页内容与交互动效的启动日横屏网页演示。

**架构：** 演示由语义化页面结构、独立样式表和单一交互控制器组成。页面通过原生浏览器能力完成翻页、分步、角色切换、自动播放和全屏，不引入新依赖；真实产品图片作为本地相对资源引用。

**技术栈：** HTML5、CSS3、原生 JavaScript、Node.js 内置测试运行器、Playwright 浏览器驱动、离线互动内容合规扫描器。

**设计说明：** `docs/superpowers/specs/2026-08-29-startday-html-presentation-design.md`

## 全局约束

- 最终演示恰好 11 页，画布比例为 16:9，解压后根目录直接包含 `index.html`。
- 不新增依赖，不使用网络请求、外部资源、站外跳转、嵌入框架、原生弹窗、内联事件或动态代码执行。
- 所有图片来自仓库现有资产，并通过相对路径离线引用。
- 兼容 iOS Safari 13.4 与 Android WebView 119 的语法基线。
- 面向用户的英文产品名保留，通用界面文案使用中文。
- 每次代码提交都必须形成完整可播放状态，并使用中文提交说明。

---

### 任务 1：建立 11 页演示与基础播放控制

**文件：**

- 新建：`presentation/startday-report/index.html`
- 新建：`presentation/startday-report/styles.css`
- 新建：`presentation/startday-report/presentation.js`
- 新建：`tests/presentation/startday-report.test.ts`

**接口：**

- 输入：键盘事件、控制按钮点击、滚轮事件、触摸手势。
- 输出：`window.startDayPresentation`，包含 `next()`、`previous()`、`goTo(index)`、`getState()` 四个方法。
- 状态：`getState()` 返回 `{ slideIndex: number, stepIndex: number, slideCount: number, autoplay: boolean }`。

- [ ] **步骤 1：编写第一个失败的浏览器测试**

使用 Node.js 内置测试运行器启动只监听本机的临时静态服务器，并让 Playwright 打开演示。测试必须验证：页面有 11 个带标题的幻灯片节点、初始页为第 1 页、按右方向键进入第 2 页、按左方向键回到第 1 页、最后一页不会越界。关键结构如下：

```typescript
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { chromium, expect, type Browser, type Page } from "@playwright/test";

type PresentationState = {
	slideIndex: number;
	stepIndex: number;
	slideCount: number;
	autoplay: boolean;
};

const reportRoot = resolve("presentation/startday-report");
let server: Server;
let browser: Browser;
let page: Page;
let serverUrl = "";

before(async () => {
	server = createServer(async (request, response) => {
		const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
		const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
		const filePath = resolve(reportRoot, relativePath);
		if (!filePath.startsWith(reportRoot)) {
			response.writeHead(403).end();
			return;
		}
		try {
			const body = await readFile(filePath);
			const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png" }[extname(filePath)] ?? "application/octet-stream";
			response.writeHead(200, { "content-type": type }).end(body);
		} catch {
			response.writeHead(404).end();
		}
	});
	await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
	const address = server.address();
	assert(address && typeof address !== "string");
	serverUrl = `http://127.0.0.1:${address.port}`;
	browser = await chromium.launch();
});

beforeEach(async () => {
	page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
});

afterEach(async () => {
	await page.close();
});

after(async () => {
	await browser.close();
	await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
});

test("加载十一页并通过键盘安全翻页", async () => {
	await page.goto(serverUrl);
	await expect(page.locator(".slide")).toHaveCount(11);
	await expect(page.locator(".slide.is-active")).toHaveAttribute("data-slide", "1");
	await page.keyboard.press("ArrowRight");
	await expect(page.locator(".slide.is-active")).toHaveAttribute("data-slide", "2");
	await page.keyboard.press("ArrowLeft");
	await expect(page.locator(".slide.is-active")).toHaveAttribute("data-slide", "1");
	await page.evaluate(() => (window as unknown as { startDayPresentation: { goTo(index: number): void } }).startDayPresentation.goTo(10));
	await page.keyboard.press("ArrowRight");
	const state = await page.evaluate(() => (window as unknown as { startDayPresentation: { getState(): PresentationState } }).startDayPresentation.getState());
	assert.equal(state.slideIndex, 10);
});
```

- [ ] **步骤 2：运行测试并确认按预期失败**

运行：

```bash
npm test -- tests/presentation/startday-report.test.ts
```

预期：失败，原因是演示入口文件或页面控制接口尚不存在，而不是测试语法错误。

- [ ] **步骤 3：实现最小可播放版本**

在 `index.html` 中写入完整 11 页语义结构，每页使用 `<section class="slide" data-slide="N" aria-label="第 N 页：标题">`。正文按设计说明重组，市场数据保留来源说明，控制区提供首页、上一页、下一页、自动播放、全屏按钮。

在 `presentation.js` 中实现：

```javascript
function getState() {
	return {
		slideIndex: state.slideIndex,
		stepIndex: state.stepIndex,
		slideCount: slides.length,
		autoplay: Boolean(state.autoplayTimer)
	};
}

window.startDayPresentation = { next, previous, goTo, getState };
```

所有事件通过 `addEventListener` 绑定。`next()` 先消耗当前页分步，再进入下一页；`previous()` 先回退当前页分步，再进入上一页。滚轮需设置短节流，触摸以水平位移超过 48 像素为翻页阈值。

在 `styles.css` 中建立 16:9 画布、蓝白主题、深色封面与收尾、页面切换和控制区基础样式；必须保证 1280×720 与 1920×1080 视口没有横向滚动。

- [ ] **步骤 4：运行测试并确认通过**

运行：

```bash
npm test -- tests/presentation/startday-report.test.ts
npm run typecheck
```

预期：浏览器测试通过，类型检查零错误。

- [ ] **步骤 5：提交完整基础演示**

```bash
git add presentation/startday-report tests/presentation/startday-report.test.ts
git commit -m "实现启动日十一页网页演示"
```

---

### 任务 2：补齐分步动效与内容交互

**文件：**

- 修改：`presentation/startday-report/index.html`
- 修改：`presentation/startday-report/styles.css`
- 修改：`presentation/startday-report/presentation.js`
- 修改：`tests/presentation/startday-report.test.ts`

**接口：**

- 输入：`[data-persona]` 标签点击、自动播放按钮点击、进入指定页面。
- 输出：当前岗位详情、分步可见状态、数据增长状态、架构连线点亮状态。
- 约定：激活岗位标签带 `aria-selected="true"`，其余标签为 `false`；自动播放按钮带 `aria-pressed`。

- [ ] **步骤 1：编写岗位切换与自动播放失败测试**

追加两个行为测试：

```typescript
test("点击岗位标签后展示对应的真实工作流", async () => {
	await page.goto(serverUrl);
	await page.evaluate(() => (window as unknown as { startDayPresentation: { goTo(index: number): void } }).startDayPresentation.goTo(4));
	await page.getByRole("tab", { name: "产品经理" }).click();
	await expect(page.locator("[data-persona-detail]")).toContainText("需求迭代跟进");
	await expect(page.getByRole("tab", { name: "产品经理" })).toHaveAttribute("aria-selected", "true");
});

test("手动操作会停止自动播放", async () => {
	await page.goto(serverUrl);
	await page.getByRole("button", { name: "自动播放" }).click();
	assert.equal(await page.evaluate(() => (window as unknown as { startDayPresentation: { getState(): PresentationState } }).startDayPresentation.getState().autoplay), true);
	await page.keyboard.press("ArrowRight");
	assert.equal(await page.evaluate(() => (window as unknown as { startDayPresentation: { getState(): PresentationState } }).startDayPresentation.getState().autoplay), false);
});
```

- [ ] **步骤 2：运行新增测试并确认按预期失败**

运行：

```bash
npm test -- tests/presentation/startday-report.test.ts
```

预期：新增测试失败，原因是岗位详情切换或自动播放状态尚未实现。

- [ ] **步骤 3：实现最小交互动效**

- 为第 2、3、7、8、10 页增加 `data-step` 分步节点。
- 为第 3 页任务卡增加重排后的平移动画状态。
- 为第 5 页内置五类岗位的精简数据对象；切换时只通过 `textContent` 更新三个详情区，不使用 HTML 字符串注入。
- 为第 7 页实现进入页面时一次性数字增长；离开后重置，重新进入可再次播放。
- 为第 10 页按分步点亮四层架构连线。
- 自动播放间隔固定为 8 秒；任何键盘、滚轮、触摸、岗位点击或手动控制按钮操作都会停止。
- 使用 `matchMedia("(prefers-reduced-motion: reduce)")` 关闭非必要过渡和数字增长。
- 图片加载失败时通过 `error` 事件隐藏装饰容器，不阻断演示。

- [ ] **步骤 4：运行测试并确认通过**

运行：

```bash
npm test -- tests/presentation/startday-report.test.ts
npm run typecheck
```

预期：基础翻页、岗位切换和自动播放测试全部通过，类型检查零错误。

- [ ] **步骤 5：提交完整交互版本**

```bash
git add presentation/startday-report tests/presentation/startday-report.test.ts
git commit -m "完善网页演示交互动画"
```

---

### 任务 3：接入真实资产、完成离线扫描与交付包

**文件：**

- 新建：`presentation/startday-report/assets/desktop-pet.png`
- 新建：`presentation/startday-report/assets/startday-mini-panel.png`
- 新建：`presentation/startday-report/assets/startday-workbench.png`
- 修改：`presentation/startday-report/index.html`
- 修改：`presentation/startday-report/styles.css`
- 修改：`tests/presentation/startday-report.test.ts`
- 新建：`artifacts/startday-html-presentation.zip`

**接口：**

- 输入：仓库现有图片资产与演示目录。
- 输出：可离线播放目录、压缩包、浏览器截图证据。
- 压缩包契约：根目录直接包含 `index.html`、`styles.css`、`presentation.js` 和 `assets/`。

- [ ] **步骤 1：编写离线边界失败测试**

追加测试并记录所有浏览器请求：

```typescript
test("只加载本地演示资源且没有横向溢出", async () => {
	const externalRequests: string[] = [];
	page.on("request", (request) => {
		const url = new URL(request.url());
		if (url.hostname !== "127.0.0.1") externalRequests.push(request.url());
	});
	await page.goto(serverUrl);
	expect(externalRequests).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
	await expect(page.locator("img[data-product-asset]")).toHaveCount(3);
});
```

- [ ] **步骤 2：运行测试并确认按预期失败**

运行：

```bash
npm test -- tests/presentation/startday-report.test.ts
```

预期：新增测试因真实产品图片尚未接入而失败。

- [ ] **步骤 3：复制并接入本地资产**

使用文件复制命令复用以下真实资产，不重新编码图片：

```bash
mkdir -p presentation/startday-report/assets
cp artifacts/desktop-pet.png presentation/startday-report/assets/desktop-pet.png
cp artifacts/startday-mini-panel.png presentation/startday-report/assets/startday-mini-panel.png
cp artifacts/startday-workbench.png presentation/startday-report/assets/startday-workbench.png
```

在第 1、4、10、11 页通过相对路径引用图片，保持替代文字完整；样式限制最大尺寸、裁切和投影，避免图片撑破画布。

- [ ] **步骤 4：运行完整工程验证**

运行：

```bash
npm test
npm run typecheck
node /Users/lijiawei/.codex/skills/interact-creation/scripts/h5-validator --required index.html --max-size 8388608 presentation/startday-report
```

预期：所有测试与类型检查通过，目录扫描无阻断级错误。

- [ ] **步骤 5：在浏览器中逐页检查视觉效果**

使用本机静态服务器打开演示，分别以 1280×720 和 1920×1080 检查 11 页。至少保存封面、重排、用户画像、市场数据、技术架构和收尾页截图，确认无溢出、重叠、字体缺失或不可点区域；发现问题后修复并重新运行步骤 4。

- [ ] **步骤 6：打包并扫描最终压缩包**

从演示目录内部压缩，避免多包一层目录：

```bash
cd presentation/startday-report
zip -r ../../artifacts/startday-html-presentation.zip index.html styles.css presentation.js assets
cd ../..
node /Users/lijiawei/.codex/skills/interact-creation/scripts/h5-validator --max-size 8388608 artifacts/startday-html-presentation.zip
```

预期：压缩包小于 8MB，扫描无阻断级错误，解压后根目录直接包含 `index.html`。

- [ ] **步骤 7：提交最终可交付版本**

```bash
git add presentation/startday-report tests/presentation/startday-report.test.ts artifacts/startday-html-presentation.zip
git commit -m "交付启动日离线网页演示"
```

---

## 计划自检

- 三个任务分别形成“可播放基础版、完整交互版、离线交付版”，每次提交均保持业务可用。
- 11 页结构、交互、真实资产、离线边界、压缩包和视觉验收均有对应步骤。
- 生产代码前均有失败测试，测试验证真实浏览器行为，不检查源代码字符串。
- 未新增依赖，未引入设计范围外的功能。
