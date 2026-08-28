export const workDraftOutputSchema = {
	type: "object",
	additionalProperties: false,
	required: [
		"title",
		"deadline",
		"milestones",
		"nodes",
		"assumptions",
		"confidence",
		"blockingQuestion",
	],
	properties: {
		title: { type: "string", minLength: 1 },
		deadline: {
			anyOf: [
				{ type: "string", format: "date-time" },
				{ type: "null" },
			],
		},
		milestones: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: ["title", "at", "nodeIndexes"],
				properties: {
					title: { type: "string", minLength: 1 },
					at: { type: "string", format: "date-time" },
					nodeIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
				},
			},
		},
		nodes: {
			type: "array",
			minItems: 1,
			items: {
				type: "object",
				additionalProperties: false,
				required: ["title", "owner", "workMinutes", "waitMinutes", "dependencyIndexes"],
				properties: {
					title: { type: "string", minLength: 1 },
					owner: { type: "string", minLength: 1 },
					workMinutes: { type: "integer", minimum: 0 },
					waitMinutes: { type: "integer", minimum: 0 },
					dependencyIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
				},
			},
		},
		assumptions: { type: "array", items: { type: "string", minLength: 1 } },
		confidence: { type: "number", minimum: 0, maximum: 1 },
		blockingQuestion: {
			anyOf: [
				{ type: "string", minLength: 1 },
				{ type: "null" },
			],
		},
	},
} as const;
