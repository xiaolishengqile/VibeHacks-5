import { createTextElement } from "./dom.js";

interface TextRequest {
	readonly title: string;
	readonly message: string;
	readonly defaultValue?: string;
	readonly inputType?: "text" | "number" | "datetime-local";
	readonly confirmLabel?: string;
}

const dialogShell = (title: string, message: string) => {
	const dialog = document.createElement("dialog");
	dialog.className = "app-dialog";
	const form = document.createElement("form");
	form.method = "dialog";
	form.append(createTextElement("h2", "", title));
	form.append(createTextElement("p", "", message));
	dialog.append(form);
	document.body.append(dialog);
	return { dialog, form };
};

export function requestText(options: TextRequest): Promise<string | null> {
	return new Promise((resolve) => {
		const { dialog, form } = dialogShell(options.title, options.message);
		const input = document.createElement("input");
		input.type = options.inputType ?? "text";
		input.value = options.defaultValue ?? "";
		input.required = true;
		input.autocomplete = "off";
		input.setAttribute("aria-label", options.title);
		form.append(input);
		const actions = document.createElement("div");
		actions.className = "button-row";
		const cancel = createTextElement("button", "secondary-button", "取消") as HTMLButtonElement;
		cancel.type = "button";
		const confirm = createTextElement("button", "primary-button", options.confirmLabel ?? "确认") as HTMLButtonElement;
		confirm.type = "submit";
		actions.append(cancel, confirm);
		form.append(actions);
		let settled = false;
		const finish = (value: string | null): void => {
			if (settled) return;
			settled = true;
			dialog.close();
			dialog.remove();
			resolve(value);
		};
		cancel.addEventListener("click", () => finish(null));
		dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(null); });
		form.addEventListener("submit", (event) => {
			event.preventDefault();
			const value = input.value.trim();
			if (value) finish(value);
		});
		dialog.showModal();
		input.focus();
		input.select();
	});
}

export function confirmAction(options: {
	readonly title: string;
	readonly message: string;
	readonly confirmLabel?: string;
}): Promise<boolean> {
	return new Promise((resolve) => {
		const { dialog, form } = dialogShell(options.title, options.message);
		const actions = document.createElement("div");
		actions.className = "button-row";
		const cancel = createTextElement("button", "secondary-button", "取消") as HTMLButtonElement;
		cancel.type = "button";
		const confirm = createTextElement("button", "danger-button", options.confirmLabel ?? "确认") as HTMLButtonElement;
		confirm.type = "submit";
		actions.append(cancel, confirm);
		form.append(actions);
		let settled = false;
		const finish = (value: boolean): void => {
			if (settled) return;
			settled = true;
			dialog.close();
			dialog.remove();
			resolve(value);
		};
		cancel.addEventListener("click", () => finish(false));
		dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
		form.addEventListener("submit", (event) => { event.preventDefault(); finish(true); });
		dialog.showModal();
		confirm.focus();
	});
}
