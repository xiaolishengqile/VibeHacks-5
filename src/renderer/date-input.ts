export const localWorkdayDateTimeValue = (date = new Date()): string => {
	const next = new Date(date);
	next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0);
	while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
	const pad = (value: number): string => String(value).padStart(2, "0");
	return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
};
