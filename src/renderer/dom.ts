export interface TextTarget {
	textContent: string | null;
}

export function setText(target: TextTarget, value: unknown): void {
	target.textContent = value === null || value === undefined ? "" : String(value);
}

export function renderEmpty(target: TextTarget, message: string): void {
	setText(target, message);
}

export function isSubmitDisabled(value: string, busy: boolean): boolean {
	return busy || value.trim().length === 0;
}

export function requiredElement<T extends HTMLElement>(id: string): T {
	const element = document.getElementById(id);
	if (!element) throw new Error(`界面缺少元素：${id}`);
	return element as T;
}

export function clearElement(element: HTMLElement): void {
	element.replaceChildren();
}

export function createTextElement(tag: keyof HTMLElementTagNameMap, className: string, value: string): HTMLElement {
	const element = document.createElement(tag);
	element.className = className;
	setText(element, value);
	return element;
}
