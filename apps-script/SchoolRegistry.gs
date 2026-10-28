// Verified snapshot of «Соответствие UTM в amoCRM», Бренды!A1:D140, 2026-10-28.
// Source: https://docs.google.com/spreadsheets/d/1HPrDFKrgJqUPIbX_VkFQzJbEIayUYMAFsRIzThaEYS4/edit#gid=0
// Keep enum IDs and exact campaign/city bindings; blank cities are never inferred from row order.
function leadConversionSchool_(domainValue, campaignValue, mediumValue) {
  const domain = leadConversionDomain_(domainValue);
  const campaign = String(campaignValue || '').trim().toLowerCase();
  const medium = String(mediumValue || '').trim().toLowerCase();
  const utmCity = medium === 'msk' ? 'МСК' : medium === 'spb' ? 'СПБ' : '';
  const domainCity = leadConversionCity_(domain);
  if (utmCity && domainCity !== 'Не определён' && domainCity !== utmCity) {
    return { id: '', brand: domain ? canonicalRoistatBrand_(domain, '') || 'Не определён' : 'Не определён', city: 'Не определён' };
  }
  const explicitCity = utmCity || (domainCity !== 'Не определён' ? domainCity : '');
  const campaignRows = campaign ? LEAD_CONVERSION_SCHOOL_REGISTRY.filter((row) => row.campaign === campaign) : [];
  // Match complete hostname stems, never a substring of a similar school name.
  const hostStem = domain.replace(/\.(?:ru|рф|com|net|org|ac)$/i, '').replace(/\.(?:msk|moscow|spb)$/i, '');
  const aliases = {
    'автошкола100.рф': 'avtoshkola100', 'академика-спб.рф': 'akademika-spb',
    'автошкола-автодрайв.москва': 'autodrive', 'автодрайв.спб.рф': 'autodrive-school',
    'autodrive-school-ru.creatium.site': 'autodrive-school',
  };
  const domainCampaign = aliases[domain] || hostStem;
  const domainRows = domainCampaign ? LEAD_CONVERSION_SCHOOL_REGISTRY.filter((row) => row.campaign && row.campaign === domainCampaign) : [];
  const candidates = campaignRows.length ? campaignRows : domainRows;
  const selected = explicitCity ? candidates.filter((row) => row.city === explicitCity) : candidates;
  if (selected.length === 1 && selected[0].city) return { id: selected[0].id, brand: selected[0].name, city: selected[0].city };
  const fallbackBrand = domain ? canonicalRoistatBrand_(domain, '') || 'Не определён' : candidates.length ? candidates[0].name : 'Не определён';
  // Conflicting UTM and registry bindings remain unresolved rather than assigning the wrong school.
  const conflict = candidates.length > 0 && selected.length === 0;
  return { id: '', brand: candidates.length === 1 ? candidates[0].name : fallbackBrand, city: conflict ? 'Не определён' : explicitCity || 'Не определён' };
}

const LEAD_CONVERSION_SCHOOL_REGISTRY = [
  {
    "id": "949569",
    "name": "АвтоПраво",
    "campaign": "autoshkola-avtopravo",
    "city": "МСК"
  },
  {
    "id": "949571",
    "name": "Lanister",
    "campaign": "autoschkola-lanister",
    "city": "МСК"
  },
  {
    "id": "949573",
    "name": "Mclaren",
    "campaign": "autoshkola-mclaren",
    "city": "МСК"
  },
  {
    "id": "949575",
    "name": "Автовиртуоз",
    "campaign": "avtoshkola-virtuoz",
    "city": "МСК"
  },
  {
    "id": "949577",
    "name": "АвтоГуру",
    "campaign": "autoshkola-guru",
    "city": "МСК"
  },
  {
    "id": "949579",
    "name": "АвтоДрайв_СПб",
    "campaign": "autodrive-school",
    "city": "СПБ"
  },
  {
    "id": "949581",
    "name": "АвтоДрайв_МСК",
    "campaign": "autodrive",
    "city": "МСК"
  },
  {
    "id": "949583",
    "name": "Автомобиль",
    "campaign": "avtoshkola-automobil",
    "city": "МСК"
  },
  {
    "id": "949585",
    "name": "Автомотокласс",
    "campaign": "avtoshkola-automotoklass",
    "city": "МСК"
  },
  {
    "id": "949587",
    "name": "АвтоМСК",
    "campaign": "avtoshkola-avtomsk",
    "city": "МСК"
  },
  {
    "id": "949589",
    "name": "АвтоТест",
    "campaign": "autoshkola-avtotest",
    "city": "МСК"
  },
  {
    "id": "949591",
    "name": "Велес",
    "campaign": "avtoshkola-veles",
    "city": "МСК"
  },
  {
    "id": "949593",
    "name": "Версаль",
    "campaign": "autoshkola-versal",
    "city": "МСК"
  },
  {
    "id": "949595",
    "name": "Виадук",
    "campaign": "avtoshkola-viaduk",
    "city": "МСК"
  },
  {
    "id": "949597",
    "name": "Глобал",
    "campaign": "avtoshkola-global",
    "city": "МСК"
  },
  {
    "id": "949599",
    "name": "Горизонт",
    "campaign": "autoshkola-gorizont",
    "city": "МСК"
  },
  {
    "id": "949601",
    "name": "За Рулем",
    "campaign": "avtoshkola-zarulemmsk",
    "city": "МСК"
  },
  {
    "id": "949603",
    "name": "ИмперияАвто",
    "campaign": "autoshkola-imperiaauto",
    "city": "МСК"
  },
  {
    "id": "949605",
    "name": "Комфорт",
    "campaign": "avtoshkola-komfort",
    "city": "МСК"
  },
  {
    "id": "949607",
    "name": "Континенталь",
    "campaign": "avtoshkola-kontinental",
    "city": "МСК"
  },
  {
    "id": "949609",
    "name": "Мастер",
    "campaign": "autoshkola-master",
    "city": "МСК"
  },
  {
    "id": "949611",
    "name": "Нева-авто",
    "campaign": "avtoshkola-auto-neva",
    "city": "МСК"
  },
  {
    "id": "949613",
    "name": "Нефрит",
    "campaign": "autonefrit",
    "city": "МСК"
  },
  {
    "id": "949615",
    "name": "Оптимус-авто",
    "campaign": "optimusavtomsk",
    "city": "МСК"
  },
  {
    "id": "949617",
    "name": "По правилам",
    "campaign": "autoshkola-po-pravilam",
    "city": "МСК"
  },
  {
    "id": "949619",
    "name": "По Пути",
    "campaign": "autoshkola-poputi",
    "city": "МСК"
  },
  {
    "id": "949621",
    "name": "Пора за руль",
    "campaign": "autoshkola-porazarul",
    "city": "МСК"
  },
  {
    "id": "949623",
    "name": "Прайм-авто",
    "campaign": "autoshkola-praimauto",
    "city": "МСК"
  },
  {
    "id": "949625",
    "name": "Родос",
    "campaign": "autoshkola-rodos",
    "city": "МСК"
  },
  {
    "id": "949627",
    "name": "Руль",
    "campaign": "avtoshkola-rul",
    "city": "МСК"
  },
  {
    "id": "949629",
    "name": "СитиАвто",
    "campaign": "avtoshkola-cityavto",
    "city": "МСК"
  },
  {
    "id": "949631",
    "name": "Скай Авто",
    "campaign": "avtoshkola-skyauto",
    "city": "МСК"
  },
  {
    "id": "949633",
    "name": "Смарт",
    "campaign": "avtoshkola-smart",
    "city": "МСК"
  },
  {
    "id": "949635",
    "name": "Топгир",
    "campaign": "avtoshkola-tg",
    "city": "МСК"
  },
  {
    "id": "949637",
    "name": "Триумф",
    "campaign": "autoshkola-triumf",
    "city": "МСК"
  },
  {
    "id": "949639",
    "name": "Ученик",
    "campaign": "avtoshkola-uchenik",
    "city": "МСК"
  },
  {
    "id": "949641",
    "name": "Фарс",
    "campaign": "avtoshkola-fars",
    "city": "МСК"
  },
  {
    "id": "949643",
    "name": "Флагман",
    "campaign": "avtoshkola-flagmanmsk",
    "city": "МСК"
  },
  {
    "id": "949645",
    "name": "Хайдрайв",
    "campaign": "avtoshkola-hidrive",
    "city": "МСК"
  },
  {
    "id": "949647",
    "name": "Экзамен",
    "campaign": "autoshkola-examen",
    "city": "МСК"
  },
  {
    "id": "949649",
    "name": "Ягуар МСК",
    "campaign": "avtoshkola-yaguarmsk",
    "city": "МСК"
  },
  {
    "id": "949651",
    "name": "МСК Hermes",
    "campaign": "hermes-mos",
    "city": "МСК"
  },
  {
    "id": "949653",
    "name": "Автошедевр",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949655",
    "name": "АвтоСити",
    "campaign": "avtoshkola-as",
    "city": "СПБ"
  },
  {
    "id": "949657",
    "name": "АбсолютАМ",
    "campaign": "avtoshkola-absolut",
    "city": "СПБ"
  },
  {
    "id": "949659",
    "name": "Авента",
    "campaign": "autoshkola-aventa",
    "city": "СПБ"
  },
  {
    "id": "949661",
    "name": "АвтоАвис",
    "campaign": "autoshkola-autoavis",
    "city": "СПБ"
  },
  {
    "id": "949663",
    "name": "АвтоАрион",
    "campaign": "autoshkola-autoarion",
    "city": "СПБ"
  },
  {
    "id": "949665",
    "name": "Автобот",
    "campaign": "avtoshkola-avtobot",
    "city": "СПБ"
  },
  {
    "id": "949667",
    "name": "АвтоВек",
    "campaign": "avtoshkola-autovek",
    "city": "СПБ"
  },
  {
    "id": "949669",
    "name": "Автогранд",
    "campaign": "avtoshkola-autogrand",
    "city": "СПБ"
  },
  {
    "id": "949671",
    "name": "АвтоЗачёт",
    "campaign": "avtoshkola-autozachet",
    "city": "СПБ"
  },
  {
    "id": "949673",
    "name": "Автоклуб",
    "campaign": "avtoshkola-avtoclub",
    "city": "СПБ"
  },
  {
    "id": "949675",
    "name": "АвтоКлюч",
    "campaign": "avtoshkola-autokluch",
    "city": "СПБ"
  },
  {
    "id": "949677",
    "name": "АвтоКурс",
    "campaign": "autoshkola-autokurs",
    "city": "СПБ"
  },
  {
    "id": "949679",
    "name": "Автолеон",
    "campaign": "avtoshkola-autoleon",
    "city": "СПБ"
  },
  {
    "id": "949681",
    "name": "АвтоМираж",
    "campaign": "avtoshkola-mirazh",
    "city": "СПБ"
  },
  {
    "id": "949683",
    "name": "Автомоторс",
    "campaign": "avtoshkola-automotors",
    "city": "СПБ"
  },
  {
    "id": "949685",
    "name": "АвтоМотоСПб",
    "campaign": "avtomotospb",
    "city": "СПБ"
  },
  {
    "id": "949687",
    "name": "АвтоНавык",
    "campaign": "avtoshkola-autonavik",
    "city": "СПБ"
  },
  {
    "id": "949689",
    "name": "Автополюс",
    "campaign": "avtoshkola-autopolus",
    "city": "СПБ"
  },
  {
    "id": "949691",
    "name": "Авто-Премиум",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949693",
    "name": "АвтоПрофи",
    "campaign": "avtoshkola-avtoprofi",
    "city": "СПБ"
  },
  {
    "id": "949695",
    "name": "АвтоСтиль",
    "campaign": "avtoshkola-autostil",
    "city": "СПБ"
  },
  {
    "id": "949697",
    "name": "АвтоСтудент",
    "campaign": "avtoshkola-student",
    "city": "СПБ"
  },
  {
    "id": "949699",
    "name": "АвтоТрек",
    "campaign": "avtoshkola-autotrack",
    "city": "СПБ"
  },
  {
    "id": "949701",
    "name": "Автошкола 100.рф",
    "campaign": "avtoshkola100",
    "city": "СПБ"
  },
  {
    "id": "949703",
    "name": "Академика",
    "campaign": "akademika-spb",
    "city": "СПБ"
  },
  {
    "id": "949705",
    "name": "А-поло",
    "campaign": "avtoshkola-apolo",
    "city": "СПБ"
  },
  {
    "id": "949707",
    "name": "Балтик",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949709",
    "name": "Вариант",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949711",
    "name": "Виктория",
    "campaign": "autoshkola-victoria",
    "city": "СПБ"
  },
  {
    "id": "949713",
    "name": "Гарант",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949715",
    "name": "Движение",
    "campaign": "autoshkola-dvijenie",
    "city": "СПБ"
  },
  {
    "id": "949717",
    "name": "За Правами",
    "campaign": "avtoshkola-zapravami",
    "city": "СПБ"
  },
  {
    "id": "949719",
    "name": "Зеленый свет",
    "campaign": "avtoshkola-greenlight",
    "city": "СПБ"
  },
  {
    "id": "949721",
    "name": "Колибри",
    "campaign": "autoshkola-kolibri",
    "city": "СПБ"
  },
  {
    "id": "949723",
    "name": "КроссАвто",
    "campaign": "avtoshkola-krossauto",
    "city": "СПБ"
  },
  {
    "id": "949725",
    "name": "Максимум",
    "campaign": "autoshkola-maximum",
    "city": "СПБ"
  },
  {
    "id": "949727",
    "name": "Манёвр",
    "campaign": "autoshkola-manevr",
    "city": "СПБ"
  },
  {
    "id": "949729",
    "name": "Мотор",
    "campaign": "avtoshkola-motor",
    "city": "СПБ"
  },
  {
    "id": "949731",
    "name": "От винта",
    "campaign": "avtoshkola-otvinta",
    "city": "СПБ"
  },
  {
    "id": "949733",
    "name": "Первая Передача",
    "campaign": "avtoshkola-pervayaperedacha",
    "city": "СПБ"
  },
  {
    "id": "949735",
    "name": "Прайт-авто",
    "campaign": "avtoshkola-praitauto",
    "city": "СПБ"
  },
  {
    "id": "949737",
    "name": "ПрестижАвто",
    "campaign": "avtoshkola-prestigeavto",
    "city": "СПБ"
  },
  {
    "id": "949739",
    "name": "Профи",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949741",
    "name": "Рулевой МСК",
    "campaign": "rulevoy-msk",
    "city": "МСК"
  },
  {
    "id": "949743",
    "name": "Рулер",
    "campaign": "avtoshkola-ruler",
    "city": "СПБ"
  },
  {
    "id": "949745",
    "name": "Седан",
    "campaign": "avtoshkola-sedan",
    "city": "СПБ"
  },
  {
    "id": "949747",
    "name": "Седьмая Миля",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949749",
    "name": "Сигнал",
    "campaign": "avtoshkola-signal",
    "city": "СПБ"
  },
  {
    "id": "949751",
    "name": "Скорость",
    "campaign": "autoshkola-skorost",
    "city": "СПБ"
  },
  {
    "id": "949753",
    "name": "Фараон",
    "campaign": "autoshkola-faraon",
    "city": "СПБ"
  },
  {
    "id": "949755",
    "name": "Флэш",
    "campaign": "autoshkola-flash",
    "city": "СПБ"
  },
  {
    "id": "949757",
    "name": "Форвард",
    "campaign": "avtoshkola-forvard",
    "city": "СПБ"
  },
  {
    "id": "949759",
    "name": "Центральная",
    "campaign": "autoshkola-centralnaya",
    "city": "СПБ"
  },
  {
    "id": "949761",
    "name": "Штиль",
    "campaign": "avtoshkola-shtil",
    "city": "СПБ"
  },
  {
    "id": "949763",
    "name": "Экстра",
    "campaign": "avtoshkola-extra",
    "city": "СПБ"
  },
  {
    "id": "949765",
    "name": "Ягуар СПБ",
    "campaign": "avtoshkola-yaguarspb",
    "city": "СПБ"
  },
  {
    "id": "949767",
    "name": "СПБ Hermes",
    "campaign": "hermesrf-spb",
    "city": "СПБ"
  },
  {
    "id": "949769",
    "name": "Успех",
    "campaign": "yspexspb",
    "city": "СПБ"
  },
  {
    "id": "949771",
    "name": "Атлант МСК",
    "campaign": "avtoshkola-atlant",
    "city": "МСК"
  },
  {
    "id": "949773",
    "name": "Алонсо",
    "campaign": "avtoshkola-alonso",
    "city": "МСК"
  },
  {
    "id": "949775",
    "name": "Армада",
    "campaign": "avtoshkola-armada",
    "city": "МСК"
  },
  {
    "id": "949777",
    "name": "Аксель МСК",
    "campaign": "avtoshkola-axel",
    "city": "МСК"
  },
  {
    "id": "949779",
    "name": "МСК Бамблби",
    "campaign": "avtoshkola-bamblbi",
    "city": "МСК"
  },
  {
    "id": "949781",
    "name": "Амарант",
    "campaign": "shkolaamarant",
    "city": "МСК"
  },
  {
    "id": "949783",
    "name": "Авто Юнекон",
    "campaign": "autoshkola-autounikon",
    "city": "МСК"
  },
  {
    "id": "949785",
    "name": "ПораЗаРуль_СПб",
    "campaign": "pora-za-rul",
    "city": "СПБ"
  },
  {
    "id": "949787",
    "name": "Driving",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949789",
    "name": "Ralli",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949791",
    "name": "AutoLand",
    "campaign": "autolandschool",
    "city": "СПБ"
  },
  {
    "id": "949793",
    "name": "ИзиДрайв_СПб",
    "campaign": "izidrive",
    "city": "СПБ"
  },
  {
    "id": "949795",
    "name": "ИзиДрайв_МСК",
    "campaign": "izidrive",
    "city": "МСК"
  },
  {
    "id": "949797",
    "name": "ХэппиДрайвер",
    "campaign": "avtoshkola-happydriver",
    "city": "СПБ"
  },
  {
    "id": "949799",
    "name": "ДримАвто СПБ",
    "campaign": "dreamautoschool",
    "city": "СПБ"
  },
  {
    "id": "949801",
    "name": "Московская школа вождения",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949803",
    "name": "Педалькин СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949805",
    "name": "Питерская школа вождения СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949807",
    "name": "АртДрайв СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949809",
    "name": "АвтоМастер СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949811",
    "name": "СтритДрайв СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949813",
    "name": "812 СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949815",
    "name": "Петербургскиий ДрайвКлуб СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949817",
    "name": "ПТС СПб",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949819",
    "name": "АвтоСити - БИ",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949821",
    "name": "Автодрайв - БИ МСК",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949823",
    "name": "Альянс",
    "campaign": "autoshkola-alyans",
    "city": "МСК"
  },
  {
    "id": "949825",
    "name": "Неизвестен",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949827",
    "name": "Селект",
    "campaign": "schoolselect",
    "city": "МСК"
  },
  {
    "id": "949829",
    "name": "Импорт",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949831",
    "name": "Без бренда",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949833",
    "name": "Рулевой СПБ",
    "campaign": "avtoshkola-rulevoi",
    "city": "СПБ"
  },
  {
    "id": "949875",
    "name": "Автодрайв - БИ СПБ",
    "campaign": "",
    "city": ""
  },
  {
    "id": "949877",
    "name": "ИзиДрайв БИ МСК",
    "campaign": "",
    "city": ""
  },
  {
    "id": "951215",
    "name": "РЕК/КЭШБЕК",
    "campaign": "",
    "city": ""
  },
  {
    "id": "951287",
    "name": "RalliShop",
    "campaign": "rallishop",
    "city": "МСК"
  },
  {
    "id": "952035",
    "name": "Топгир Метро",
    "campaign": "",
    "city": ""
  },
  {
    "id": "952073",
    "name": "Автошкола-ООО",
    "campaign": "",
    "city": ""
  }
];
