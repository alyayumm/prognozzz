from __future__ import annotations

import argparse
import calendar
import csv
import json
import math
import re
import sys
import unicodedata
import urllib.request
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbxQSYUaFmhVdmZ1JKruN2AS0hV7TidbKaXAKXEx0REXmNmvYqIq39YniEyrY8Kes2F7fA/exec"
DEFAULT_DOWNLOADS = Path.home() / "Downloads"
FILE_RE = re.compile(r"project_285979_report-1_(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.xlsx$", re.I)

SOURCE_COLUMNS = [
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

KNOWN_BRAND_PATTERNS = [
    (("izidrive", "izidrivespb", "izidrivemsk", "изи драйв", "изи-драйв"), "Изи Драйв"),
    (("autodrive", "автодрайв", "авто драйв"), "АвтоДрайв"),
    (("hermes", "гермес"), "Гермес"),
    (("porazarul", "pora za rul", "pora-za-rul", "porarulyu", "nam po puti", "poputi", "пора за руль"), "Пора за руль"),
    (("rulevoy", "rulevoi", "ruler", "avtoshkola rul", "рулевой"), "Рулевой"),
    (("topgir", "topgear", "avtoshkola tg", "топгир"), "ТопГир"),
    (("avtosity", "avto city", "авто сити", "avtoshkola as"), "АвтоСити"),
    (("avtopravo", "автоправо"), "АвтоПраво"),
    (("avtotest", "автотест"), "АвтоТест"),
    (("schoolselect", "school select"), "SchoolSelect"),
    (("dreamautoschool", "dream auto"), "Dream Auto"),
    (("autolandschool", "autoland"), "Автолэнд"),
    (("akademika", "академика"), "Академика"),
    (("apolo", "аполо", "a polo", "а поло"), "А-Поло"),
    (("alonso", "алонсо"), "Алонсо"),
    (("shtil", "штиль"), "Штиль"),
    (("avtoprofi", "автопрофи"), "АвтоПрофи"),
    (("auto neva", "autoneva", "автонева"), "АвтоНева"),
    (("avtoclub", "автоклуб"), "АвтоКлуб"),
    (("atlant", "атлант"), "Атлант"),
    (("guru", "гуру"), "АвтоГуру"),
    (("victoria", "виктория"), "Виктория"),
    (("student", "студент"), "Студент"),
    (("automobil", "автомобиль"), "АвтоМобиль"),
    (("rallis", "ралли"), "Ралли"),
    (("veles", "велес"), "Велес"),
    (("rodos", "родос"), "Родос"),
    (("avtomotospb", "automotoklass", "автомото"), "АвтоМотоКласс"),
    (("kontinental", "континентал"), "Континенталь"),
    (("mirazh", "мираж"), "Мираж"),
    (("kolibri", "колибри"), "Колибри"),
    (("yaguar", "jaguar", "ягуар"), "Ягуар"),
    (("mclaren", "макларен"), "McLaren"),
    (("manevr", "маневр"), "Маневр"),
    (("flagman", "флагман"), "Флагман"),
    (("avtomsk", "автомск"), "АвтоМСК"),
    (("armada", "армада"), "Армада"),
    (("avtoshkola100", "автошкола100"), "Автошкола 100"),
    (("uchenik", "ученик"), "Ученик"),
    (("viaduk", "виадук"), "Виадук"),
    (("autotrack", "автотрек"), "АвтоТрек"),
    (("lanister", "ланистер"), "Ланистер"),
    (("zapravami", "za pravami", "за правами"), "ЗаПравами"),
    (("dvijenie", "движение"), "Движение"),
    (("yspex", "uspeh", "успех"), "Успех"),
    (("avtobot", "автобот"), "АвтоБот"),
    (("autonavik", "автонавик"), "АвтоНавик"),
    (("skyauto", "скайавто"), "SkyAuto"),
    (("centralnaya", "центральная"), "Центральная"),
    (("absolut", "абсолют"), "Абсолют"),
    (("autogrand", "автогранд"), "АвтоГранд"),
    (("autoleon", "автолеон"), "АвтоЛеон"),
    (("forvard", "форвард"), "Форвард"),
    (("smart", "смарт"), "Smart"),
    (("global", "глобал"), "Глобал"),
]

BAD_DOMAIN_VALUES = {
    "",
    "-",
    ".",
    "1",
    "nan",
    "none",
    "неизвестен",
    "неизвестное значение",
    "нет домена",
    "итого/среднее",
    "рек кэшбек",
    "партнерский",
    "партнерскии",
    "иное",
}

GENERIC_BRANDS = {
    "Без бренда",
    "Сделки Созданные",
    "Прямые Визиты",
    "Яндекс Yandex",
    "Google Google",
    "Яндекс Директ",
    "Geoadv Geoadv",
    "Рек Кэшбек",
}


def is_generic_brand(brand: str) -> bool:
    key = text_key(brand)
    return (
        brand in GENERIC_BRANDS
        or key in {"2gis 2gis", "иное иное", "партнерскии", "партнерский", "рек кешбек"}
        or not re.search(r"[a-zа-я]", key)
    )


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).replace("\u00a0", " ").strip()
    return re.sub(r"\s+", " ", text)


def text_key(value: str) -> str:
    text = clean_text(value).lower().replace("ё", "е")
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"https?://", " ", text)
    text = re.sub(r"www\.", " ", text)
    text = re.sub(r"\.(ru|рф|com|net|org|spb|moscow|msk)\b", " ", text)
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def id_key(value: str) -> str:
    return re.sub(r"[^0-9a-zа-я]+", "-", text_key(value)).strip("-") or "unknown"


def number(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isnan(value):
            return 0.0
        return float(value)
    text = clean_text(value)
    if not text or text == "-":
        return 0.0
    text = text.replace(" ", "").replace(",", ".")
    text = re.sub(r"[^0-9.\-]", "", text)
    try:
        return float(text)
    except ValueError:
        return 0.0


def is_range_file(path: Path) -> bool:
    match = FILE_RE.match(path.name)
    if not match:
        return False
    start = datetime.strptime(match.group(1), "%Y-%m-%d").date()
    end = datetime.strptime(match.group(2), "%Y-%m-%d").date()
    days = (end - start).days + 1
    month_end = calendar.monthrange(end.year, end.month)[1]
    return 2 <= days <= 7 and (start.day == 1 or start.weekday() == 0) and (end.weekday() == 6 or end.day == month_end)


def discover_files(downloads: Path) -> list[Path]:
    files = [path for path in downloads.glob("project_285979_report-1_2026-*.xlsx") if is_range_file(path)]
    return sorted(files, key=lambda path: FILE_RE.match(path.name).group(1))


def extract_dates(path: Path) -> tuple[str, str]:
    match = FILE_RE.match(path.name)
    if not match:
        raise ValueError(f"Cannot read dates from {path.name}")
    return match.group(1), match.group(2)


def normalize_source(row: pd.Series) -> str:
    first_source = clean_text(row.get("Источник (уровень 1)", ""))
    first_value = clean_text(row.get("Источник (уровень 1) значение", ""))
    first_key = text_key(f"{first_source} {first_value}")
    if first_key in {"seo", "сайт", "сайты", "site", "sites"} or "визиты с сайтов" in first_key:
        return "SEO"
    if "прям" in first_key:
        return "Прямые визиты"

    parts = [clean_text(row.get(column, "")) for column in SOURCE_COLUMNS]
    joined = " ".join(part for part in parts if part)
    lower = text_key(joined)

    if "2gis" in lower or "2 гис" in lower or "link 2gis" in lower:
        return "2ГИС"
    if "gkart" in lower or re.search(r"(^|\s)go($|\s)", lower) or "google" in lower or "гугл" in lower:
        return "Гугл Карты"
    if (
        "ykart" in lower
        or "ykar" in lower
        or re.search(r"(^|\s)yk($|\s)", lower)
        or re.search(r"(^|\s)ya($|\s)", lower)
        or "geoadv maps" in lower
        or ("яндекс" in lower and "карт" in lower)
    ):
        return "Яндекс Карты"
    if "geoadv direct" in lower or "direct" in lower or "директ" in lower:
        return "Яндекс Директ"
    if "seo" in lower or lower in {"сайт", "сайты", "site", "sites"} or "визиты с сайтов" in lower:
        return "SEO"
    if "прям" in lower:
        return "Прямые визиты"
    if "zoon" in lower:
        return "Zoon"
    if "кешбек" in lower or "кэшбек" in lower or "cashback" in lower or "рек" in lower:
        return "Рек/кешбэк"
    if "робот" in lower or "bot" in lower:
        return "Роботы"
    return "Другие"


def normalize_city(row: pd.Series) -> str | None:
    domain = clean_text(row.get("Домен", ""))
    source_text = " ".join(clean_text(row.get(column, "")) for column in SOURCE_COLUMNS)
    joined_raw = f"{domain} {source_text}".lower().replace("ё", "е").replace("\u00a0", " ")
    joined_key = text_key(joined_raw)

    has_spb = bool(re.search(r"(^|[^a-zа-я])(spb|спб|петербург|санкт)([^a-zа-я]|$)", joined_raw))
    has_msk = bool(re.search(r"(^|[^a-zа-я])(msk|мск|москва|moscow|moskva|mos)([^a-zа-я]|$)", joined_raw))
    if has_spb and not has_msk:
        return "СПБ"
    if has_msk and not has_spb:
        return "МСК"

    if any(marker in joined_key for marker in ["izidrive msk", "autodrive msk", "hermes mos", "rulevoy msk", "flagmanmsk"]):
        return "МСК"
    if any(marker in joined_key for marker in ["autodrive school", "hermesrf spb", "avtoshkola as", "pora za rul", "avtomotospb", "yspexspb", "yaguarspb", "izidrive ru"]):
        return "СПБ"

    vvr_spb = clean_text(row.get("ВВР СПБ (пользовательский)", ""))
    vvr_msk = clean_text(row.get("ВВР МСК (пользовательский)", ""))
    spb_active = bool(vvr_spb and vvr_spb != "00:00:00")
    msk_active = bool(vvr_msk and vvr_msk != "00:00:00")
    if spb_active and not msk_active:
        return "СПБ"
    if msk_active and not spb_active:
        return "МСК"

    return None


def normalize_domain(value: Any) -> str:
    domain = clean_text(value)
    if text_key(domain) in BAD_DOMAIN_VALUES:
        return ""
    return domain.replace("https://", "").replace("http://", "").strip("/")


def infer_brand(row: pd.Series) -> str:
    domain = normalize_domain(row.get("Домен", ""))
    source_text = " ".join(clean_text(row.get(column, "")) for column in SOURCE_COLUMNS)
    source_key = text_key(source_text)
    key = text_key(f"{domain} {source_text}")
    for patterns, brand in KNOWN_BRAND_PATTERNS:
        if any(text_key(pattern) in source_key for pattern in patterns):
            return brand
    for patterns, brand in KNOWN_BRAND_PATTERNS:
        if any(text_key(pattern) in key for pattern in patterns):
            return brand

    if domain:
        stem = text_key(domain)
        stem = re.sub(r"\b(avtoshkola|autoshkola|school|autoschool|auto)\b", " ", stem)
        stem = re.sub(r"\s+", " ", stem).strip()
        if stem:
            return " ".join(part.capitalize() for part in stem.split())

    tokens = [part for part in key.split() if len(part) > 2 and part not in {"utm", "search", "site", "seo", "maps"}]
    return " ".join(part.capitalize() for part in tokens[:2]) or "Без бренда"


def should_skip(row: pd.Series) -> bool:
    domain_key = text_key(clean_text(row.get("Домен", "")))
    if domain_key in {"итого среднее", "итого", "среднее"}:
        return True
    leads = number(row.get("Заявки", 0))
    qualified = number(row.get("QL (пользовательский)", 0))
    sales = number(row.get("Продажи", 0))
    revenue = number(row.get("Выручка", 0))
    budget = number(row.get("Расходы", 0))
    return leads == 0 and qualified == 0 and sales == 0 and revenue == 0 and budget == 0


def build_records(files: list[Path]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    groups: dict[tuple[str, str, str, str, str], dict[str, Any]] = {}
    skipped_city = defaultdict(float)
    skipped_files = defaultdict(int)
    source_totals = defaultdict(lambda: {"leads": 0.0, "qualified": 0.0, "sales": 0.0})
    city_totals = defaultdict(lambda: {"leads": 0.0, "qualified": 0.0, "sales": 0.0})

    for path in files:
        week_start, _week_end = extract_dates(path)
        month_key = week_start[:7]
        df = pd.read_excel(path, sheet_name=0)
        for _, row in df.iterrows():
            if should_skip(row):
                continue
            city = normalize_city(row)
            brand = infer_brand(row)
            source = normalize_source(row)
            domain = normalize_domain(row.get("Домен", "")) or id_key(brand)
            leads = number(row.get("Заявки", 0))
            qualified = number(row.get("QL (пользовательский)", 0))
            sales = number(row.get("Продажи", 0))
            revenue = number(row.get("Выручка", 0))
            budget = number(row.get("Расходы", 0))

            if is_generic_brand(brand):
                continue

            if not city:
                skipped_city[path.name] += leads
                skipped_files[path.name] += 1
                continue

            key = (week_start, city, brand, source)
            if key not in groups:
                groups[key] = {
                    "id": f"brandperf-{week_start}-{id_key(city)}-{id_key(brand)}-{id_key(source)}",
                    "weekStart": week_start,
                    "monthKey": month_key,
                    "city": city,
                    "brand": brand,
                    "domain": domain,
                    "_domains": set([domain]) if domain else set(),
                    "source": source,
                    "leads": 0.0,
                    "qualified": 0.0,
                    "sales": 0.0,
                    "revenue": 0.0,
                    "budget": 0.0,
                }
            record = groups[key]
            record["leads"] += leads
            record["qualified"] += qualified
            record["sales"] += sales
            record["revenue"] += revenue
            record["budget"] += budget
            if domain:
                record["_domains"].add(domain)
            for bucket in (source_totals[source], city_totals[city]):
                bucket["leads"] += leads
                bucket["qualified"] += qualified
                bucket["sales"] += sales

    records = []
    for record in groups.values():
        domains = sorted(record.pop("_domains", set()))
        record["domain"] = " · ".join(domains[:3]) if domains else record["domain"]
        leads = record["leads"]
        qualified = record["qualified"]
        sales = record["sales"]
        revenue = record["revenue"]
        budget = record["budget"]
        record["roas"] = revenue / budget if budget > 0 else None
        record["cpl"] = budget / leads if leads > 0 else 0
        record["cpql"] = budget / qualified if qualified > 0 else 0
        record["saleCost"] = budget / sales if sales > 0 else 0
        record["avgCheck"] = revenue / sales if sales > 0 else 0
        for field in ["leads", "qualified", "sales"]:
            record[field] = int(round(record[field]))
        for field in ["revenue", "budget", "cpl", "cpql", "saleCost", "avgCheck"]:
            record[field] = round(record[field], 2)
        if record["roas"] is not None:
            record["roas"] = round(record["roas"], 4)
        records.append(record)

    records.sort(key=lambda item: (item["weekStart"], item["city"], item["brand"], item["source"], item["domain"]))
    summary = {
        "files": len(files),
        "records": len(records),
        "sourceTotals": source_totals,
        "cityTotals": city_totals,
        "skippedCityRows": dict(skipped_files),
        "skippedCityLeads": dict(skipped_city),
    }
    return records, summary


def post_to_apps_script(endpoint: str, password: str, records: list[dict[str, Any]], chunk_size: int) -> int:
    updated = 0
    for start in range(0, len(records), chunk_size):
        chunk = records[start : start + chunk_size]
        body = json.dumps(
            {"action": "upsertBrandPerformance", "password": password, "payload": {"records": chunk}},
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            endpoint,
            data=body,
            headers={"Content-Type": "text/plain;charset=utf-8"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not payload.get("ok"):
            raise RuntimeError(payload.get("error") or "Apps Script returned an error")
        data = payload.get("data") or {}
        updated += int(data.get("updated", len(chunk)))
    return updated


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    headers = [
        "id",
        "weekStart",
        "monthKey",
        "city",
        "brand",
        "domain",
        "source",
        "leads",
        "qualified",
        "sales",
        "revenue",
        "budget",
        "roas",
        "cpl",
        "cpql",
        "saleCost",
        "avgCheck",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)


def print_summary(records: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    print(f"Files: {summary['files']}")
    print(f"Prepared records: {summary['records']}")
    print("City totals:")
    for city, values in sorted(summary["cityTotals"].items()):
        print(f"  {city}: leads={values['leads']:.0f}, qualified={values['qualified']:.0f}, sales={values['sales']:.0f}")
    print("Source totals:")
    for source, values in sorted(summary["sourceTotals"].items(), key=lambda item: -item[1]["leads"]):
        print(f"  {source}: leads={values['leads']:.0f}, qualified={values['qualified']:.0f}, sales={values['sales']:.0f}")
    if summary["skippedCityRows"]:
        print("Rows skipped because city was ambiguous:")
        for file_name, count in summary["skippedCityRows"].items():
            leads = summary["skippedCityLeads"].get(file_name, 0)
            print(f"  {file_name}: rows={count}, leads={leads:.0f}")
    print("Top brands:")
    by_brand = defaultdict(lambda: {"leads": 0, "qualified": 0, "sales": 0})
    for record in records:
        bucket = by_brand[record["brand"]]
        bucket["leads"] += record["leads"]
        bucket["qualified"] += record["qualified"]
        bucket["sales"] += record["sales"]
    for brand, values in sorted(by_brand.items(), key=lambda item: -item[1]["sales"])[:20]:
        print(f"  {brand}: leads={values['leads']}, qualified={values['qualified']}, sales={values['sales']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import weekly Roistat brand reports into Brand_Performance_Weekly.")
    parser.add_argument("--downloads", type=Path, default=DEFAULT_DOWNLOADS)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--password", default="")
    parser.add_argument("--chunk-size", type=int, default=150)
    parser.add_argument("--upload", action="store_true")
    parser.add_argument("--out", type=Path, default=Path("tmp/brand-performance-weekly.json"))
    parser.add_argument("--csv", type=Path, default=Path("public/data/brand-performance-weekly.csv"))
    args = parser.parse_args()

    files = discover_files(args.downloads)
    if not files:
        print("No weekly files found.", file=sys.stderr)
        return 1

    records, summary = build_records(files)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"records": records, "summary": summary}, ensure_ascii=False, indent=2), encoding="utf-8")
    write_csv(args.csv, records)
    print_summary(records, summary)
    print(f"Saved JSON: {args.out}")
    print(f"Saved CSV: {args.csv}")

    if args.upload:
        if not args.password:
            print("--password is required with --upload", file=sys.stderr)
            return 2
        updated = post_to_apps_script(args.endpoint, args.password, records, args.chunk_size)
        print(f"Uploaded records: {updated}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
