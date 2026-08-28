import { randomUUID } from "node:crypto";

export interface IdGenerator {
	next(prefix: string): string;
}

export class RandomIdGenerator implements IdGenerator {
	next(prefix: string): string {
		return `${prefix}_${randomUUID()}`;
	}
}
