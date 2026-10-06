import { sameSecret } from '../runtime.js';

export function createSetupHandler(env = process.env, fetcher = fetch) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method === 'GET') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
      return res.status(200).send('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Подключение Telegram-бота</title><style>body{font:18px system-ui;max-width:650px;margin:60px auto;padding:20px}input,button{font:inherit;padding:10px;display:block;margin:15px 0}</style><h1>Подключение Telegram-бота</h1><p>Регистрирует webhook и команды существующего бота. Цены подарков не меняет.</p><form method="POST"><label>Секрет настройки (CRON_SECRET)<input type="password" name="secret" required autocomplete="off"></label><button>Подключить бота</button></form></html>');
    }
    if (req.method !== 'POST') return res.status(405).end();
    const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body;
    if (!sameSecret(body?.secret, env.CRON_SECRET)) return res.status(401).json({ ok: false });
    if (!env.CONTROL_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) return res.status(503).json({ ok: false, reason: 'configuration_missing' });
    const publicHost = env.VERCEL_PROJECT_PRODUCTION_URL;
    if (!publicHost || !/^[a-z0-9-]+\.vercel\.app$/i.test(publicHost)) return res.status(503).json({ ok: false, reason: 'domain_missing' });
    try {
      const call = async (method, payload = {}) => {
        const response = await fetcher(`https://api.telegram.org/bot${env.CONTROL_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error('TELEGRAM_SETUP_FAILED');
        return data.result;
      };
      const me = await call('getMe');
      // Protect against accidentally configuring another existing bot's token.
      if (me.username?.toLowerCase() !== 'giftpricecontrol812_bot') return res.status(409).json({ ok: false, reason: 'wrong_bot' });
      const url = `https://${publicHost}/api/telegram`;
      await call('setWebhook', { url, secret_token: env.TELEGRAM_WEBHOOK_SECRET, allowed_updates: ['message'] });
      await call('setMyCommands', { commands: [{ command: 'status', description: 'Состояние автонастройки' }, { command: 'report', description: 'Последний отчёт' }, { command: 'pause', description: 'Остановить изменение лимитов' }, { command: 'resume', description: 'Возобновить ежедневную настройку' }] });
      const info = await call('getWebhookInfo');
      if (info.url !== url) throw new Error('WEBHOOK_VERIFICATION_FAILED');
      return res.status(200).json({ ok: true, bot: me.username, webhook: info.url });
    } catch {
      return res.status(503).json({ ok: false, reason: 'telegram_setup_failed' });
    }
  };
}
export default createSetupHandler();
