# Недельный отчет RECTOP

Веб-панель для недельного отчета: дашборды показывают месяцы, недели, графики и события, а вкладка `Админка` нужна для ежедневного ввода факта.

## Что есть

- `Все месяцы`: длинная недельная лента всех месяцев.
- `Обзор месяца`: KPI, выполнение плана, воронка, конверсии и недельные графики месяца.
- `Неделя`: детальный ввод/просмотр выбранной недели.
- `Админка`: ежедневный ввод `МСК / СПБ / Сообщения` x `Лиды / КВАЛ / Продажи`.
- `Сообщения`: отдельная витрина, не смешивается с городами.
- `События`: календарь внешних и внутренних факторов.

## Логика данных

- `Все` = `МСК + СПБ`, без сообщений.
- `МСК` = только Москва.
- `СПБ` = только Санкт-Петербург.
- `Сообщения` считаются отдельно.
- Новый месяц создается с планами по `МСК`, `СПБ`, `Сообщениям` и трем метрикам.
- Дневные планы распределяются автоматически по датам месяца.

## Google Sheets

Apps Script создает и использует служебные листы:

- `Month_Config`
- `Month_Plans`
- `Data_Daily`
- `Weekly_Summary`
- `Event_Map`

Действия моста:

- `verifyPassword`
- `getMonths`
- `getMonthData`
- `createMonth`
- `upsertDailyValues`
- `upsertEvent`

## Подключение

1. Открыть Google Sheets.
2. Открыть Apps Script.
3. Вставить код из `apps-script/AppsScript.gs`.
4. Запустить `setupWeeklyReportService`.
5. Запустить `setWeeklyReportPassword("ваш-пароль")`.
6. Опубликовать Apps Script как Web App.
7. Добавить URL в переменные окружения:

```text
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
VITE_ADMIN_PASSWORD=ваш-пароль
```

Для GitHub Pages добавьте `VITE_APPS_SCRIPT_URL` в GitHub: Settings -> Secrets and variables -> Actions -> Variables или Secrets. Пароль админки в GitHub Pages не добавляйте: его нужно вводить в панели, иначе он попадет в публичный JS.

Если `VITE_APPS_SCRIPT_URL` не задан, панель работает в локальном fallback на демо-данных.

## Локальный запуск

```powershell
pnpm install
pnpm run dev
```

## Проверка перед публикацией

```powershell
pnpm run lint
pnpm run build
```
