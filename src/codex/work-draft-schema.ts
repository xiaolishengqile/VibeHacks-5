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
				required: ["title", "owner", "workMinutes", "waitMinutes", "dependencyIndexes", "detail"],
				properties: {
					title: { type: "string", minLength: 1 },
					owner: { type: "string", minLength: 1 },
					workMinutes: { type: "integer", minimum: 0 },
					waitMinutes: { type: "integer", minimum: 0 },
					dependencyIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
					sourceNodeId: { type: "string", minLength: 1 },
					detail: {
						type: "object",
						additionalProperties: false,
						required: ["summary", "steps", "deliverables", "successCriteria", "suggestions", "contingencies"],
						properties: {
							summary: { type: "string", minLength: 1 },
							steps: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
							deliverables: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
							successCriteria: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
							suggestions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
							contingencies: {
								type: "array",
								minItems: 1,
								items: {
									type: "object",
									additionalProperties: false,
									required: ["risk", "trigger", "action"],
									properties: {
										risk: { type: "string", minLength: 1 },
										trigger: { type: "string", minLength: 1 },
										action: { type: "string", minLength: 1 },
									},
								},
							},
						},
					},
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
