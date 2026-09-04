from __future__ import annotations

import argparse
import calendar
import csv
import json
import math
import re
import unicodedata
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_DOWNLOADS = Path.home() / "Downloads"
FILE_RE = re.compile(r"project_285979_report-24_(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})(?: \(\d+\))?\.xlsx$", re.I)
TARGET_FUNNELS = {"МСК АШ": "МСК", "СПБ АШ": "СПБ"}
METRIC_COLUMNS = {
    "Лиды": "Заявки",
    "Квалы": "QL (пользовательский)",
    "Продажи": "Продажи",
}
SOURCE_COLUMNS = [
    "Источник",
    "Источник (уровень 1)",
    "Источник (уровень 1) значение",
    "Источник (уровень 2)",
    "Источник (уровень 2) значение",
    "Источник (уровень 3)",
    "Источник (уровень 3) значение",
    "Источник (уровень 4)",
    "Источник (уровень 4) значение",
    "Источник (уровень 5)",
    "Источник (уровень 5) значение",
    "Источник (уровень 6)",
    "Источник (уровень 6) значение",
    "Источник (уровень 7)",
    "Источник (уровень 7) значение",
]
SOURCE_SLUGS = {
    "SEO": "seo",
    "Яндекс Карты": "yandexmaps",
    "Директ": "direct",
    "2ГИС": "2gis",
    "Гугл Карты": "googlemaps",
    "Прямые визиты": "directvisits",
    "Рек/кешбэк": "cashback",
    "Zoon": "zoon",
    "ВКонтакте": "vk",
    "Другие": "other",
}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).replace("\u00a0", " ").strip()
    return re.sub(r"\s+", " ", text)


def text_key(value: Any) -> str:
    text = clean_text(value).lower().replace("ё", "е")
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"https?://", " ", text)
    text = re.sub(r"www\.", " ", text)
    text = re.sub(r"[^0-9a-zа-я._:-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return 0.0 if math.isnan(float(value)) else float(value)
    text = clean_text(value)
    if not text or text == "-":
        return 0.0
    text = text.replace(" ", "").replace(",", ".")
    text = re.sub(r"[^0-9.\-]", "", text)
    try:
        return float(text)
    except ValueError:
        return 0.0


def source_slug(source: str) -> str:
    if source in SOURCE_SLUGS:
        return SOURCE_SLUGS[source]
    slug = text_key(source)
    slug = re.sub(r"[^0-9a-zа-я]+", "-", slug).strip("-")
    return slug or "unknown"


def week_of_month(date_iso: str) -> int:
    current = datetime.strptime(date_iso, "%Y-%m-%d").date()
    first = date(current.year, current.month, 1)
    first_monday_offset = first.weekday()
    return ((current.day + first_monday_offset - 1) // 7) + 1


def file_range(path: Path) -> tuple[str, str] | None:
    match = FILE_RE.match(path.name)
    if not match:
        return None
    return match.group(1), match.group(2)


def is_weekly_range(start_iso: str, end_iso: str) -> bool:
    start = datetime.strptime(start_iso, "%Y-%m-%d").date()
    end = datetime.strptime(end_iso, "%Y-%m-%d").date()
    days = (end - start).days + 1
    month_end = calendar.monthrange(end.year, end.month)[1]
    return 2 <= days <= 7 and (start.day == 1 or start.weekday() == 0) and (end.weekday() == 6 or end.day == month_end)


def discover_files(downloads: Path, start_month: str, end_month: str) -> list[Path]:
    latest_by_range: dict[tuple[str, str], Path] = {}
    for path in downloads.glob("project_285979_report-24_2026-*.xlsx"):
        range_values = file_range(path)
        if not range_values:
            continue
        start_iso, end_iso = range_values
        month_key = start_iso[:7]
        if month_key < start_month or month_key > end_month:
            continue
        if not is_weekly_range(start_iso, end_iso):
            continue
        key = (start_iso, end_iso)
        current = latest_by_range.get(key)
        if current is None or path.stat().st_mtime > current.stat().st_mtime:
            latest_by_range[key] = path
    return sorted(latest_by_range.values(), key=lambda path: file_range(path) or ("", ""))


def canonical_source(row: pd.Series) -> str:
    values = [clean_text(row.get(column, "")) for column in SOURCE_COLUMNS]
    raw_source = values[0].lower().replace("ё", "е")
    joined = text_key(" ".join(value for value in values if value))

    if "директ" in raw_source or "yandex.direct" in joined or "geoadv direct" in joined or "direct" in joined:
        return "Директ"
    if "2gis" in raw_source or "2гис" in raw_source or "2gis" in joined or "2 гис" in joined or "link.2gis" in joined:
        return "2ГИС"
    if "google" in raw_source or "гугл" in raw_source or "gkart" in joined or "google" in joined or "гугл" in joined:
        return "Гугл Карты"
    if (
        "яндекс.карт" in raw_source
        or "yandex maps" in joined
        or "ykart" in joined
        or "ykar" in joined
        or re.search(r"(^|\s|:|_)ya($|\s|:|_)", joined)
        or ("яндекс" in joined and "карт" in joined)
    ):
        return "Яндекс Карты"
    if "zoon" in raw_source or "zoon" in joined:
        return "Zoon"
    if "вконтакте" in raw_source or "vk" in joined:
        return "ВКонтакте"
    if "сайт" in raw_source or "визиты с сайтов" in joined or re.search(r"(^|\s|:|_)site(s)?($|\s|:|_)", joined):
        return "SEO"
    if "прям" in raw_source or "прям" in joined:
        return "Прямые визиты"
    if "кешбек" in joined or "кэшбек" in joined or "cashback" in joined or "рек" in joined:
        return "Рек/кешбэк"
    return "Другие"


def should_skip_row(row: pd.Series) -> bool:
    source = clean_text(row.get("Источник", "")).lower()
    if source in {"итого/среднее", "итого", "среднее"}:
        return True
    return all(number(row.get(column, 0)) == 0 for column in METRIC_COLUMNS.values())


def build_records(files: list[Path]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    grouped: dict[tuple[str, str, str, str], dict[str, float]] = defaultdict(lambda: {metric: 0.0 for metric in METRIC_COLUMNS})
    skipped_funnels: dict[str, dict[str, float]] = defaultdict(lambda: {metric: 0.0 for metric in METRIC_COLUMNS})
    file_names: list[str] = []

    for path in files:
        range_values = file_range(path)
        if not range_values:
            continue
        week_start, week_end = range_values
        file_names.append(path.name)
        df = pd.read_excel(path, sheet_name=0).fillna("")

        for _, row in df.iterrows():
            if should_skip_row(row):
                continue
            funnel = clean_text(row.get("Воронка продаж", ""))
            city = TARGET_FUNNELS.get(funnel)
            metrics = {metric: number(row.get(column, 0)) for metric, column in METRIC_COLUMNS.items()}
            if not city:
                for metric, value in metrics.items():
                    skipped_funnels[funnel or "(пусто)"][metric] += value
                continue
            source = canonical_source(row)
            for metric, value in metrics.items():
                grouped[(week_start, week_end, city, source)][metric] += value

    rows: list[dict[str, Any]] = []
    now = datetime.now().isoformat(timespec="seconds")
    for (week_start, week_end, city, source), values in sorted(grouped.items()):
        month_key = week_start[:7]
        week = week_of_month(week_start)
        city_code = "msk" if city == "МСК" else "spb"
        comment = f"Roistat report-24 апрель-июль: недельные суммы по воронке {city} АШ [SOURCE_CITY={city}]"
        for metric in METRIC_COLUMNS:
            fact = int(round(values[metric]))
            if fact <= 0:
                continue
            rows.append(
                {
                    "id": f"{week_start}-source-recalc-{city_code}-{source_slug(source)}-{source_slug(metric)}",
                    "date": week_start,
                    "month": month_key,
                    "week": week,
                    "city": "источники",
                    "channel": source,
                    "metric": metric,
                    "plan": 0,
                    "fact": fact,
                    "forecast": 0,
                    "comment": comment,
                    "updatedAt": now,
                    "recommendations": 0,
                    "omQualified": 0,
                    "weekEnd": week_end,
                }
            )

    summary = {
        "files": len(files),
        "fileNames": file_names,
        "rows": len(rows),
        "totals": totals_by(rows, "metric"),
        "totalsByCity": totals_by(rows, "cityScope"),
        "totalsBySource": totals_by(rows, "channel"),
        "skippedFunnels": skipped_funnels,
    }
    return rows, summary


def totals_by(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, int]]:
    output: dict[str, dict[str, int]] = defaultdict(lambda: {metric: 0 for metric in METRIC_COLUMNS})
    for row in rows:
        if key == "cityScope":
            match = re.search(r"\[SOURCE_CITY=([^\]]+)\]", row["comment"])
            bucket = match.group(1) if match else ""
        else:
            bucket = str(row.get(key, ""))
        output[bucket][row["metric"]] += int(row["fact"])
    return dict(output)


def write_json(path: Path, rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"rows": rows, "summary": summary}, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    headers = [
        "id",
        "date",
        "month",
        "week",
        "city",
        "channel",
        "metric",
        "plan",
        "fact",
        "forecast",
        "comment",
        "updatedAt",
        "recommendations",
        "omQualified",
        "weekEnd",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_sheet_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    headers = [
        "id",
        "date",
        "month",
        "week",
        "city",
        "channel",
        "metric",
        "plan",
        "fact",
        "forecast",
        "comment",
        "updatedAt",
        "recommendations",
        "omQualified",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writerows(rows)


def print_summary(summary: dict[str, Any]) -> None:
    print(f"Files: {summary['files']}")
    print(f"Prepared Data_Daily rows: {summary['rows']}")
    print("Totals by city:")
    for city, values in sorted(summary["totalsByCity"].items()):
        print(f"  {city}: leads={values['Лиды']}, qualified={values['Квалы']}, sales={values['Продажи']}")
    print("Totals by source:")
    for source, values in sorted(summary["totalsBySource"].items(), key=lambda item: -item[1]["Лиды"]):
        print(f"  {source}: leads={values['Лиды']}, qualified={values['Квалы']}, sales={values['Продажи']}")
    if summary["skippedFunnels"]:
        print("Skipped funnels:")
        for funnel, values in sorted(summary["skippedFunnels"].items()):
            total = sum(values.values())
            if total:
                print(f"  {funnel}: leads={values['Лиды']}, qualified={values['Квалы']}, sales={values['Продажи']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare Roistat report-24 weekly source rows for Data_Daily.")
    parser.add_argument("--downloads", type=Path, default=DEFAULT_DOWNLOADS)
    parser.add_argument("--start-month", default="2026-04")
    parser.add_argument("--end-month", default="2026-07")
    parser.add_argument("--out", type=Path, default=Path("tmp/source-daily-report-24.json"))
    parser.add_argument("--csv", type=Path, default=Path("tmp/source-daily-report-24.csv"))
    parser.add_argument("--sheet-csv", type=Path, default=Path("public/data/source-daily-report-24.csv"))
    args = parser.parse_args()

    files = discover_files(args.downloads, args.start_month, args.end_month)
    rows, summary = build_records(files)
    write_json(args.out, rows, summary)
    write_csv(args.csv, rows)
    write_sheet_csv(args.sheet_csv, rows)
    print_summary(summary)
    print(f"Saved JSON: {args.out}")
    print(f"Saved CSV: {args.csv}")
    print(f"Saved sheet CSV: {args.sheet_csv}")
    return 0 if rows else 1


if __name__ == "__main__":
    raise SystemExit(main())
