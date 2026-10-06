export const STOP_NOTICE = 'Автонастройка остановлена. Уже отправленный запрос может завершиться. Автопокупка в Gift Satellite продолжает работать по ранее установленным лимитам.';

export function reportText(report) {
  if (!report) return 'Отчётов пока нет.';
  const states = { paused: 'Автонастройка на паузе', disconnected: 'API Gift Satellite ещё не подключён', blocked: 'Настройка цен заблокирована', completed: 'Проверка завершена', error: 'Проверка не завершена' };
  return [
    `Gift Satellite — ежедневный отчёт\n${report.date}`,
    states[report.status] || 'Неизвестный результат',
    Number.isInteger(report.checked) ? `Проверено слотов: ${report.checked}` : null,
    Number.isInteger(report.changed) ? `Изменено лимитов: ${report.changed}` : null,
    Number.isInteger(report.skipped) ? `Пропущено: ${report.skipped}` : null,
    report.reason === 'api_authorization_failed' ? 'Gift Satellite отклонил постоянный API-ключ. Требуется документированный формат авторизации.' : null,
    report.reason === 'write_contract_unverified' ? 'Чтение API доступно; метод изменения лимитов ещё не проверен.' : null,
    report.status === 'blocked' ? 'Цены в реальном приложении не изменялись.' : null,
    report.status === 'disconnected' ? 'Цены в реальном приложении не изменялись.' : null,
    report.status === 'error' ? 'Изменения прекращены. Нужно проверить подключение API.' : null,
    '/status — состояние · /pause — остановить · /resume — возобновить',
  ].filter(Boolean).join('\n');
}

export async function handleCommand(update, { ownerId, store, send }) {
  const m = update?.message;
  if (!ownerId || m?.chat?.type !== 'private' || String(m?.from?.id) !== String(ownerId) || String(m?.chat?.id) !== String(ownerId)) return false;
  const command = (m.text || '').trim().split(/\s/)[0].split('@')[0].toLowerCase();
  if (!['/start', '/help', '/status', '/report', '/pause', '/resume'].includes(command)) return false;
  if (!Number.isSafeInteger(update.update_id)) return false;
  if (command === '/pause' || command === '/resume') {
    const applied = await store.command(update.update_id, command === '/pause');
    const paused = await store.isPaused();
    await send(applied ? (paused ? STOP_NOTICE : 'Автонастройка разрешена. Следующая проверка — по ежедневному расписанию. Без подключённого API цены не изменяются.') : `Повторная или устаревшая команда пропущена. Автонастройка ${paused ? 'на паузе' : 'разрешена'}.`);
  } else if (command === '/report') {
    await send(reportText(await store.getReport()));
  } else {
    await send(`Автонастройка: ${(await store.isPaused()) ? 'на паузе' : 'разрешена'}.\n${reportText(await store.getReport())}\n/pause — остановить изменение лимитов\n/resume — разрешить ежедневную настройку\n/report — последний отчёт`);
  }
  return true;
}

// Every provider write must call the pause guard immediately beforehand.
export async function dailyReport({ store, send, run, now = new Date() }) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const lease = await store.claimDay(day);
  if (!lease) return { duplicate: true };
  try {
    const cached = await store.getDayReport(day);
    if (cached) {
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
        report.status = result.status === 'blocked' ? 'blocked' : 'completed';
        if (['api_authorization_failed', 'write_contract_unverified'].includes(result.reason)) report.reason = result.reason;
      }
    } catch {
      report.status = (await store.isPaused()) ? 'paused' : 'error';
    }
    await store.saveReport(report);
    await store.saveDayReport(day, report);
    await send(reportText(report));
    await store.finishDay(day);
    return report;
  } finally {
    await store.releaseDay(day, lease);
  }
}
