import type { EventItem, EventType } from "../types";

export const eventMapSpreadsheetId = "1o4qyb30kxjUuCx2H-xStbD5Xw2P3m9d784NAE3dPyg4";
export const eventMapUrl = `https://docs.google.com/spreadsheets/d/${eventMapSpreadsheetId}/edit`;
const cacheKey = `rectop:event-map:${eventMapSpreadsheetId}:v1`;
const sourceSheets = [{ sheetName: "СПб", city: "СПБ" }, { sheetName: "МСК", city: "МСК" }] as const;
let lastSuccessfulEvents: EventItem[] | null = null;

export type EventMapTable = {
  cols: Array<{ label?: string | null }>;
  rows: Array<{ c?: Array<{ v?: string | number | null; f?: string | null } | null> | null }>;
};

export type EventMapSnapshot = { events: EventItem[]; available: boolean; warning?: string };

export function isEventMapEvent(event: Pick<EventItem, "id">): boolean {
  return event.id.startsWith("event-map-");
}

export async function loadEventMapSnapshot(
  readSheet: (sheetName: string) => Promise<EventMapTable>,
): Promise<EventMapSnapshot> {
  try {
    const cityEvents = await Promise.all(sourceSheets.map(async ({ sheetName, city }) =>
      parseEventMapSheet(await readSheet(sheetName), city),
    ));
    const events = mergeEventMapEvents([], cityEvents.flat());
    lastSuccessfulEvents = events;
    try {
      window.localStorage.setItem(cacheKey, JSON.stringify(events));
    } catch { /* A successful read remains usable when browser storage is unavailable. */ }
    return { events, available: true };
  } catch {
    const events = lastSuccessfulEvents ?? readCachedEvents();
    if (events) lastSuccessfulEvents = events;
    return {
      events: events ?? [],
      available: events !== null,
      warning: events
        ? "Карта событий временно недоступна. Показана последняя успешная загрузка обоих городов."
        : "Карта событий пока не загрузилась. Сохранённые события отчёта доступны; повторите обновление.",
    };
  }
}

export function parseEventMapSheet(table: EventMapTable, city: "МСК" | "СПБ"): EventItem[] {
  if (table.cols.length < 3) throw new Error("В карте событий отсутствуют столбцы даты, события и примечания.");
  let year: number | undefined;
  return table.rows.flatMap((row) => {
    const dateCell = row.c?.[0];
    const rawDate = String(dateCell?.v ?? "").trim();
    if (/^20\d{2}$/.test(rawDate)) { year = Number(rawDate); return []; }
    const title = String(row.c?.[1]?.v ?? "").trim();
    if (!title || title === "Событие") return [];
    const date = parseEventDate(rawDate, year);
    if (!date) throw new Error(`В карте событий некорректная дата: ${rawDate}`);
    const description = String(row.c?.[2]?.v ?? "").replace(/\r\n?/g, "\n").trim();
    const type = eventTypeForTitle(title);
    const event: EventItem = {
      id: `event-map-${city}-${contentHash([date, title, description].join("\u0000"))}`,
      startDate: date,
      endDate: date,
      title,
      description,
      city,
      type,
      group: /^внешний фактор$/i.test(title) ? "external" : "internal",
      source: "google_sheets",
      expectedEffect: "неизвестно",
      actualEffect: "неизвестно",
      importance: 2,
      metric: "все",
    };
    return [event];
  });
}

export function mergeEventMapEvents(savedEvents: EventItem[], sourceEvents: EventItem[]): EventItem[] {
  const saved = savedEvents.filter((event) => !isEventMapEvent(event));
  const keys = new Set(saved.map(eventKey));
  return [...saved, ...sourceEvents.filter((event) => {
    const key = eventKey(event);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id));
}

function eventKey(event: EventItem): string {
  return JSON.stringify([event.city, event.startDate, event.endDate, event.title.trim(), event.description.replace(/\r\n?/g, "\n").trim()]);
}

function parseEventDate(value: string, year?: number): string | null {
  const gviz = value.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,.*)?\)$/);
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const local = value.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  const parts = gviz
    ? [Number(gviz[1]), Number(gviz[2]) + 1, Number(gviz[3])]
    : iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : local && (local[3] || year) ? [Number(local[3] || year), Number(local[2]), Number(local[1])] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 2000 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function eventTypeForTitle(title: string): EventType {
  if (/^(рк|акции|запуск летних акций|замена акций|посевы тг|авито)/i.test(title)) return "рекламные изменения";
  if (/^(сайт|номера|яндекс|проблем|не работает|не отправляется|на .* не появляется|ошибка|исправление ошибки|отключение подменных)/i.test(title)) return "техработы";
  if (/^(добавление|удалени?е|удалене|дизайн|дизан|цены|замена товаров|присоединение партнера)/i.test(title)) return "продуктовые изменения";
  return "прочее";
}

function contentHash(value: string): string {
  let hash = 14695981039346656037n;
  for (const character of value) hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0)!)) * 1099511628211n);
  return hash.toString(16).padStart(16, "0");
}

function readCachedEvents(): EventItem[] | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(cacheKey) ?? "null");
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every((event) => event && typeof event.id === "string" && isEventMapEvent(event)
      && event.source === "google_sheets" && (event.city === "МСК" || event.city === "СПБ")
      && typeof event.title === "string" && typeof event.description === "string"
      && parseEventDate(event.startDate) === event.startDate && event.endDate === event.startDate);
    return valid ? parsed as EventItem[] : null;
  } catch { return null; }
}
