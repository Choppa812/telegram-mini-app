export const STOP_NOTICE = 'Автонастройка и ежедневные сообщения остановлены до /resume. Уже отправленный запрос может завершиться. Автопокупка в Gift Satellite продолжает работать по ранее установленным лимитам.';

export function reportText(report) {
  if (!report) return 'Отчётов пока нет.';
  const states = { paused: 'Автонастройка на паузе', disconnected: 'API Gift Satellite ещё не подключён', blocked: 'Настройка цен заблокирована', completed: 'Проверка завершена', error: 'Проверка не завершена' };
  return [
    `Gift Satellite — ежедневный отчёт\n${report.date}`,
    states[report.status] || 'Неизвестный результат',
    Number.isInteger(report.checked) ? `Проверено слотов: ${report.checked}` : null,
    Number.isInteger(report.changed) ? `Изменено лимитов: ${report.changed}` : null,
    Number.isInteger(report.skipped) ? `Пропущено: ${report.skipped}` : null,
    Array.isArray(report.details) ? report.details.join('\n') : null,
    report.reason === 'api_authorization_failed' ? 'Gift Satellite отклонил постоянный API-ключ. Требуется документированный формат авторизации.' : null,
    report.reason === 'write_contract_unverified' ? 'Чтение API доступно; метод изменения лимитов ещё не проверен.' : null,
    report.status === 'blocked' ? 'Цены в реальном приложении не изменялись.' : null,
    report.status === 'disconnected' ? 'Цены в реальном приложении не изменялись.' : null,
    report.status === 'error' ? 'Изменения прекращены. Нужно проверить подключение API.' : null,
    '/status — состояние · /pause — остановить · /resume — возобновить',
  ].filter(Boolean).join('\n');
}

export async function handleCommand(update, { ownerId, store, send, checkApi, marketOverview, floorOverview, inspectGift, feeOverview, turnoverOverview, blackDailySales, blackScan, positionsOverview, blackModels, applyBlack }) {
  const m = update?.message;
  if (!ownerId || m?.chat?.type !== 'private' || String(m?.from?.id) !== String(ownerId) || String(m?.chat?.id) !== String(ownerId)) return false;
  const command = (m.text || '').trim().split(/\s/)[0].split('@')[0].toLowerCase();
  if (!['/start', '/help', '/status', '/report', '/pause', '/resume', '/checkapi', '/market', '/floors', '/inspect', '/fees', '/rank', '/blackday', '/blackscan', '/positions', '/models', '/applyblack'].includes(command)) return false;
  if (!Number.isSafeInteger(update.update_id)) return false;
  if (command === '/applyblack') {
    if (await store.isPaused()) await send('Автонастройка на паузе. Для изменения слотов сначала /resume.');
    else try {
      const result=await applyBlack({ beforeWrite:async()=>{if(await store.isPaused())throw new Error('AUTOMATION_PAUSED');} });
      const report={date:new Date().toISOString(),status:'completed',checked:result.checked,changed:result.changed,skipped:result.skipped,details:result.details};
      await store.saveReport(report);
      await send(`Black — настройка завершена. Изменено ${result.changed}, без изменений ${result.skipped}.\n${result.details.join('\n')}\nПроверено повторным чтением API.`);
    } catch (error) { await send(`Black — настройка прервана: ${String(error?.message||'ERROR').replace(/[^A-Z0-9_ .-]/g,'').slice(0,100)}. Проверьте /positions Vice Cream и /positions Chill Flame.`); }
  } else if (command === '/positions') {
    const filter=(m.text||'').trim().replace(/^\S+\s*/,'').trim();
    try { await send(await positionsOverview(filter)); }
    catch { await send('Текущие слоты не удалось прочитать.'); }
  } else if (command === '/models') {
    const collection=(m.text||'').trim().replace(/^\S+\s*/,'').trim();
    if(!collection)await send('Укажите коллекцию: /models Vice Cream');
    else try { await send(await blackModels(collection)); }
    catch { await send('Модели Black не удалось проверить. Слоты не менялись.'); }
  } else if (command === '/blackscan') {
    const index = Number((m.text || '').trim().replace(/^\S+\s*/, '').trim());
    if (!Number.isInteger(index) || index < 0 || index > 30) await send('Укажите номер пакета от 0: /blackscan 0');
    else try { await send(await blackScan(index)); }
    catch { await send('Сканирование Black не удалось завершить. Слоты не менялись.'); }
  } else if (command === '/blackday') {
    const collection = (m.text || '').trim().replace(/^\S+\s*/, '').trim();
    if (!collection) await send('Укажите коллекцию: /blackday Vice Cream');
    else try { await send(await blackDailySales(collection)); }
    catch { await send('Продажи Black не удалось проверить. Слоты не менялись.'); }
  } else if (command === '/rank') {
    try { await send(await turnoverOverview()); }
    catch { await send('Частоту продаж не удалось проверить. Слоты не менялись.'); }
  } else if (command === '/fees') {
    try { await send(await feeOverview()); }
    catch { await send('Комиссии не удалось проверить. Слоты не менялись.'); }
  } else if (command === '/inspect') {
    const collection = (m.text || '').trim().replace(/^\S+\s*/, '').trim();
    if (!collection) await send('Укажите коллекцию после команды: /inspect B-Day Candle');
    else try { await send(await inspectGift(collection)); }
    catch { await send('Не удалось проверить коллекцию. Укажите её точное название; слоты не менялись.'); }
  } else if (command === '/floors') {
    try { await send(await floorOverview()); }
    catch { await send('Минимальные цены не удалось получить. Слоты не менялись.'); }
  } else if (command === '/market') {
    try { await send(await marketOverview()); }
    catch { await send('Обзор рынка не завершён: ошибка соединения или ответа. Слоты не менялись.'); }
  } else if (command === '/checkapi') {
    try {
      const result = await checkApi?.();
      await send(result?.ok ? `API: чтение доступно. Слотов: ${result.slots}. Коллекций: ${result.collections?.count ?? 0} (HTTP ${result.collections?.status ?? '?'}). Офферов: ${result.offers?.count ?? 0} (HTTP ${result.offers?.status ?? '?'}). Изменения цен не выполнялись.` : `API: доступ не подтверждён. ${(result?.attempts || []).map(a=>`${a.mode}: HTTP ${a.status}`).join('; ')}. Проверены только запросы чтения, цены не менялись.`);
    } catch { await send('Проверка API не завершена: ошибка соединения или ответа. Цены не менялись.'); }
  } else if (command === '/pause' || command === '/resume') {
    const applied = await store.command(update.update_id, command === '/pause');
    const paused = await store.isPaused();
    await send(applied ? (paused ? STOP_NOTICE : 'Автонастройка разрешена. Следующая проверка — по ежедневному расписанию или по сигналу VPS.') : `Повторная или устаревшая команда пропущена. Автонастройка ${paused ? 'на паузе' : 'разрешена'}.`);
  } else if (command === '/report') {
    await send(reportText(await store.getReport()));
  } else {
    await send(`Автонастройка: ${(await store.isPaused()) ? 'на паузе' : 'разрешена'}.\n${reportText(await store.getReport())}\n/pause — остановить изменение лимитов\n/resume — разрешить ежедневную настройку\n/report — последний отчёт\n/market — обзор рынка без изменений`);
  }
  return true;
}

// Every provider write must call the pause guard immediately beforehand.
export async function dailyReport({ store, send, run, now = new Date() }) {
  // Paused cron invocations are silent and do not consume the day's run.
  if (await store.isPaused()) return { status: 'paused', silent: true };
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const lease = await store.claimDay(day);
  if (!lease) return { duplicate: true };
  try {
    const cached = await store.getDayReport(day);
    if (cached) {
      if (await store.isPaused()) return { status: 'paused', silent: true };
      await send(reportText(cached));
      await store.finishDay(day);
      return cached;
    }
    const report = { date: now.toISOString(), status: 'disconnected' };
    try {
      if (await store.isPaused()) report.status = 'paused';
      else if (run) {
        const beforeWrite = async () => {
          if (await store.isPaused()) throw new Error('AUTOMATION_PAUSED');
        };
        const result = await run({ beforeWrite });
        for (const key of ['checked', 'changed', 'skipped']) {
          if (!Number.isSafeInteger(result?.[key]) || result[key] < 0) throw new Error('INVALID_REPORT');
          report[key] = result[key];
        }
        if (Array.isArray(result.details)) report.details = result.details.slice(0,10).map(String);
        report.status = result.status === 'blocked' ? 'blocked' : 'completed';
        if (['api_authorization_failed', 'write_contract_unverified'].includes(result.reason)) report.reason = result.reason;
      }
    } catch {
      report.status = (await store.isPaused()) ? 'paused' : 'error';
    }
    await store.saveReport(report);
    await store.saveDayReport(day, report);
    if (await store.isPaused()) return { ...report, silent: true };
    await send(reportText(report));
    await store.finishDay(day);
    return report;
  } finally {
    await store.releaseDay(day, lease);
  }
}
