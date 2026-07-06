export function formatDay(dateIso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(
    new Date(`${dateIso}T00:00:00`),
  );
}

export function weekdayLabel(dateIso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short" })
    .format(new Date(`${dateIso}T00:00:00`))
    .replace(".", "");
}

export function getMonthDates(year: number, monthIndex: number, daysInMonth: number): string[] {
  return Array.from({ length: daysInMonth }, (_, index) =>
    new Date(Date.UTC(year, monthIndex, index + 1)).toISOString().slice(0, 10),
  );
}

export function getWeekOfMonth(dateIso: string): number {
  const date = new Date(`${dateIso}T00:00:00`);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const firstMondayOffset = (first.getDay() + 6) % 7;
  return Math.floor((date.getDate() + firstMondayOffset - 1) / 7) + 1;
}
