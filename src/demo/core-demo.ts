import { pathToFileURL } from "node:url";

import { openDatabase, migrateDatabase } from "../storage/database.js";
import { SqliteWorkRepository } from "../storage/work-repository.js";
import { CommandService } from "../work/command-service.js";
import { DecisionEngine } from "../work/decision-engine.js";
import { createProfile } from "../work/profile.js";
import { basicWorkNodeDetail, validateWorkDraft } from "../work/types.js";

export interface DemoSummary {
	readonly goalId: string;
	readonly nodeTitles: readonly string[];
	readonly changedOwner: string;
	readonly topAction: string;
	readonly topReason: string;
}

class SequenceIds {
	#index = 0;

	next(prefix: string): string {
		this.#index += 1;
		return `${prefix}_${this.#index}`;
	}
}

const fixedNow = "2026-08-28T09:00:00+08:00";

export async function runCoreDemo(databasePath: string): Promise<DemoSummary> {
	const database = openDatabase(databasePath);
	try {
		migrateDatabase(database);
		const repository = new SqliteWorkRepository(database);
		const service = new CommandService(
			repository,
			new DecisionEngine(),
			new SequenceIds(),
			{ now: () => fixedNow },
		);
		const profile = createProfile({
			id: "profile_demo",
			timezone: "Asia/Shanghai",
			workdayStart: "09:00",
			workdayEnd: "18:00",
			dailyCapacityMinutes: 420,
			bufferPercent: 20,
		}, fixedNow);
		const draftResult = validateWorkDraft({
			title: "季度复盘",
			deadline: "2026-09-04T18:00:00+08:00",
			milestones: [
				{ title: "老板审核", at: "2026-09-03T16:00:00+08:00", nodeIndexes: [4] },
			],
			nodes: [
				{ title: "找协作方拿数据", owner: "小王", workMinutes: 5, waitMinutes: 1440, dependencyIndexes: [], detail: basicWorkNodeDetail("找协作方拿数据") },
				{ title: "搭建复盘框架", owner: "self", workMinutes: 120, waitMinutes: 0, dependencyIndexes: [], detail: basicWorkNodeDetail("搭建复盘框架") },
				{ title: "完成数据分析", owner: "self", workMinutes: 180, waitMinutes: 0, dependencyIndexes: [0, 1], detail: basicWorkNodeDetail("完成数据分析") },
				{ title: "生成汇报材料", owner: "self", workMinutes: 120, waitMinutes: 0, dependencyIndexes: [2], detail: basicWorkNodeDetail("生成汇报材料") },
				{ title: "老板审核", owner: "老板", workMinutes: 15, waitMinutes: 480, dependencyIndexes: [3], detail: basicWorkNodeDetail("老板审核") },
			],
			assumptions: ["协作数据预计等待一天", "老板审核预计等待半天"],
		});
		if (!draftResult.ok) throw new Error(`演示草稿无效：${draftResult.error.join("；")}`);

		const created = await service.createFromDraft({ profile, draft: draftResult.value });
		const collaboratorNode = created.aggregate.graph.nodes[0]!;
		const changed = await service.changeOwner({
			goalId: created.aggregate.graph.goal.id,
			nodeId: collaboratorNode.id,
			owner: "小赵",
		});
		const topDecision = changed.decisions[0];
		if (!topDecision) throw new Error("演示没有生成当前行动");

		return {
			goalId: changed.aggregate.graph.goal.id,
			nodeTitles: changed.aggregate.graph.nodes.map((node) => node.title),
			changedOwner: changed.aggregate.graph.node(collaboratorNode.id).owner,
			topAction: topDecision.title,
			topReason: topDecision.reason,
		};
	} finally {
		database.close();
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const summary = await runCoreDemo(":memory:");
	console.log("工作图：", summary.nodeTitles.join(" → "));
	console.log("变更后协作方：", summary.changedOwner);
	console.log("当前行动：", summary.topAction);
	console.log("行动原因：", summary.topReason);
}
