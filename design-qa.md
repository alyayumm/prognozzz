source visual truth path:
- C:\Users\HR\AppData\Local\Temp\codex-clipboard-881c0fb9-8907-4b46-8e52-e3790b5b4ab3.png
- C:\Users\HR\Desktop\тзшка графики.docx
- Brandbook images supplied in chat: RECTOP blue glass dashboard references and RECTOP logo lockup.

implementation screenshot path:
- C:\Users\HR\AppData\Local\Temp\rectop-weekly-report-qa\dashboard-1440.png
- C:\Users\HR\AppData\Local\Temp\rectop-weekly-report-qa\chart-mobile-390.png

viewport:
- 1440x900 desktop
- 390x844 mobile

state:
- Local weekly report dashboard at http://127.0.0.1:4173/
- Checked all-month dashboard with selected month July 2026 and metric Leads.

full-view comparison evidence:
- The all-month dashboard now starts with the weekly dynamics area, then three metric chart cards, then the long weekly ribbon across months.
- The visual language follows the supplied RECTOP direction: light blue page, glass panels, primary blue active controls, deep navy text, pale blue borders, and soft shadows.
- The supplied RECTOP logo asset is used in the sidebar.

focused region comparison evidence:
- Mini charts were checked against the chart spec: blue fact bars, black dashed plan line, plan legend, axis labels, value/week/delta labels under each bar, and no red/green/yellow bars.
- Long chart was checked against the chart spec: one continuous month ribbon, about four months visible, blue fact bars, black dashed plan line, light-blue dashed forecast Optima line, and bottom legend.
- Mobile chart cards were checked at 390px: cards stack in one column and all five weekly bars/labels remain visible.

findings:
- No P0/P1/P2 issues remain.

patches made since previous QA pass:
- Reworked the all-month screen around the "Динамика по неделям" block.
- Added three weekly chart cards for Лиды, Квалы, Продажи.
- Replaced red/green/yellow chart bars with RECTOP blue fact bars.
- Added black dashed plan lines and separate light-blue dashed Optima forecast line.
- Added chart axis labels, compact legends, value/week/delta labels, arrows in deltas, and hover tooltips.
- Removed old event-dot markers from mini charts.
- Fixed desktop density and mobile chart overflow.

follow-up polish:
- P3: If the official RECTOP SVG/font package becomes available, replace the current PNG logo and system font fallbacks with exact brand assets.

final result: passed

## 2026-10-26 — временно скрыта дебиторка

- Проверена локальная версия http://127.0.0.1:5191/ через CUA.
- «Обзор месяца»: сохранены потенциальная и фактическая выручка; карточка дебиторки, суммы по городам и подписи о долге скрыты.
- На 1440×900 и 1366×768 карточки выручки стоят в двух колонках, на 390×844 — в одной. Горизонтального скролла нет.
- В видимом тексте обзора и раздела «Бренды» нет упоминаний дебиторки/задолженности.
- Данные receivables и расчёт фактической выручки сохранены.
- `npm run lint`: passed.

## 2026-10-26 — спрос и сезонность Wordstat

- Опубликованная вкладка «Спрос» проверена через CUA на 1440×900, 1366×768 и 390×844; горизонтального скролла страницы нет.
- Ось содержит 12 фиксированных месяцев с января по декабрь. Переключение Москвы/СПб меняет заголовок и сохраняет позиции месяцев.
- При отсутствии доступа сервер возвращает `not_configured`, пустой набор данных и последний завершённый месяц `2026-09`. Линии и значения не выдумываются.
- Проверена кнопка «Проверить подключение», инструкция и отключённое принудительное обновление до настройки доступа. Общие фильтры CRM скрыты на этой вкладке.
- Реальная история Wordstat ещё не проверена: пользователь подтвердил отсутствие подключения Яндекс Облака. Порядок подключения — в `WORDSTAT_SETUP.md`.
- Проверки модели и сервера, включая разрывы месяцев, нули, разделение городов, целостность кэша и защиту обновления: весь набор 99/99 passed. Type-check и production build passed.
