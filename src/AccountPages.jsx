import GiftVisual from "./GiftVisual.jsx";
import React, { useEffect, useState } from "react";
import {
  fmt,
  levelInfo,
  levels,
  purchaseStats,
  filterPurchases,
  paginate,
  starsEstimate,
  nextDrop,
} from "./domain.js";

export function Switch({ label, value, onChange, disabled }) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={!!value}
        disabled={disabled}
        aria-label={label || "Активность подписки"}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i />
    </label>
  );
}
export function Pager({ page, pages, onChange }) {
  return (
    <div className="pager">
      <button
        aria-label="Предыдущая страница"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        ‹
      </button>
      <span>
        Страница {page} из {pages}
      </span>
      <button
        aria-label="Следующая страница"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        ›
      </button>
    </div>
  );
}
export const faqs = [
  [
    "Что это за приложение?",
    "Личный инструмент поиска подарков, фильтров и мониторинга. Разделы «Задания» и «Лидеры» исключены. Подписки и настройки сохраняются на собственном сервере.",
  ],
  [
    "Как работает бот?",
    "Источник площадки передаёт актуальные предложения. Сервер сопоставляет коллекцию, модель, фон, узор и номер с фильтрами. Уведомления и покупки имеют отдельные лимиты. Торговые адаптеры пока не подключены.",
  ],
  [
    "Куда приходят подарки?",
    "В исходном сервисе покупки Portals и Tonnel остаются в инвентаре площадки; Telegram и MRKT отправляют их в Telegram-профиль. В личной версии доставка должна подтверждаться подключённым адаптером.",
  ],
  [
    "Какие комиссии?",
    "Таблица уровней перенесена из исходного приложения как справочник. Собственная комиссия и начисления пока не действуют. Полный лимит покупки должен учитывать цену подарка, комиссию площадки и сетевые расходы.",
  ],
  [
    "Как увеличить уровень?",
    "В исходной модели уровень зависит от накопленного опыта. В этой версии опыт складывается только из подтверждённых записей покупок с начисленным XP. Чужие покупки и уровень автоматически не переносятся.",
  ],
  [
    "Что дают уровни?",
    "Исходная таблица связывает уровень со снижением комиссии и увеличением кэшбека. Расчёт и выплаты личного сервиса ещё не подключены.",
  ],
  [
    "Если совпали несколько фильтров?",
    "Один лот должен проходить через единую блокировку покупки, чтобы несколько подписок не купили его повторно. Приоритет торговых ордеров потребуется проверить вместе с адаптерами.",
  ],
  [
    "Почему приходят уведомления, но подарок не покупается?",
    "Уведомления и покупка — разные действия. Для покупки нужны действующая торговая авторизация, доступные средства, включённый режим и достаточный полный лимит. Сейчас автопокупка отключена до подключения площадок.",
  ],
  [
    "Почему подходящий лот может оказаться недоступен?",
    "Подарок может купить другой участник, цена может измениться, либо площадка может ограничить частоту запросов. Перед покупкой требуется повторная проверка доступности и цены.",
  ],
  [
    "Можно использовать приложение без пополнения?",
    "Да: создание подписок, пресеты, фильтры и работа с подключёнными рыночными данными не требуют пополнения. Реальные сделки требуют средств на соответствующей площадке.",
  ],
  [
    "Какие подарки доступны?",
    "Встроенный каталог содержит коллекции, наблюдавшиеся в исходном приложении. Полный и актуальный каталог атрибутов поступит от подключённых источников.",
  ],
  [
    "Как быстро работает мониторинг?",
    "Цикл проверки локального источника настроен на две секунды. Итоговая скорость зависит от обновления данных, ограничений API и ответа площадки; сделка за две секунды не гарантируется.",
  ],
];
function Metrics({ entries }) {
  return (
    <div className="metrics">
      {entries.map(([value, label]) => (
        <div key={label}>
          <b>{value}</b>
          <small>{label}</small>
        </div>
      ))}
    </div>
  );
}
function SectionLink({ title, onClick, children, className = "" }) {
  return (
    <button className={"panel profile-link " + className} onClick={onClick}>
      <div className="row heading-row">
        <span className="grow">{title}</span>
        <span className="chevron">›</span>
      </div>
      {children}
    </button>
  );
}
export default function AccountPages({
  page,
  setPage,
  data,
  purchases,
  tools,
  api,
  run,
  notify,
}) {
  const [clock, setClock] = useState(() => nextDrop()),
    [collection, setCollection] = useState(""),
    [number, setNumber] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [hideSold, setHideSold] = useState(false),
    [p, setP] = useState(1),
    [stars, setStars] = useState(""),
    [deduct, setDeduct] = useState(false),
    [amount, setAmount] = useState(""),
    [access, setAccess] = useState(null),
    [secret, setSecret] = useState(""),
    [confirm, setConfirm] = useState(""),
    [accessBusy, setAccessBusy] = useState(false);
  const stats = purchaseStats(purchases),
    info = levelInfo(stats.xp),
    rates = tools?.rates || {},
    estimate = starsEstimate(stars, deduct, rates);
  useEffect(() => {
    const timer = setInterval(() => setClock(nextDrop()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (page === "api")
      api("access")
        .then(setAccess)
        .catch((e) => notify(e.message));
  }, [page]);
  useEffect(() => setP(1), [collection, number, from, to, hideSold]);
  const accessAction = async (method) => {
    setAccessBusy(true);
    try {
      const result = await api("access", method === "POST" ? {} : null, method);
      setSecret(result.key || "");
      setAccess(await api("access"));
      setConfirm("");
    } catch (e) {
      notify(e.message);
    } finally {
      setAccessBusy(false);
    }
  };
  const back = (
    <button
      className="back"
      onClick={() =>
        setPage(
          page === "levels"
            ? "profile"
            : ["stars", "deposit", "withdraw"].includes(page)
              ? "wallet"
              : "profile",
        )
      }
    >
      ‹ Назад
    </button>
  );
  if (page === "profile")
    return (
      <>
        <SectionLink
          title={
            <>
              <span className="avatar">
                {(data.ownerName || "Я")[0]}
                <small>{info.current.level} lvl</small>
              </span>
              <span className="owner">
                {data.ownerName || "Владелец"}
                <small>
                  {fmt(stats.xp)} / {info.next ? fmt(info.next.xp) : "MAX"} XP
                </small>
              </span>
            </>
          }
          onClick={() => setPage("levels")}
        >
          <p>
            {info.next
              ? `До ${info.next.level} уровня`
              : "Максимальный уровень"}
          </p>
          <div className="progress">
            <i style={{ width: info.progress + "%" }} />
          </div>
          <small>
            {info.next
              ? `Осталось ${fmt(info.remaining)} XP`
              : "Все уровни открыты"}
          </small>
        </SectionLink>
        <h3>Стейкинг</h3>
        <div className="staking-grid">
          <SectionLink title="USDT Стейкинг" onClick={() => setPage("usdt")}>
            <Metrics
              entries={[
                [fmt(tools?.staking?.usdt), "Застейкано"],
                [fmt(tools?.staking?.earned), "Заработано"],
              ]}
            />
          </SectionLink>
          <SectionLink
            className="violet"
            title="Стейкинг"
            onClick={() => setPage("staking")}
          >
            <b className="countdown">
              {clock.hours}ч {clock.minutes}м
            </b>
            <small>Следующий дроп через:</small>
          </SectionLink>
        </div>
        <h3>Покупки</h3>
        <SectionLink title="Мои покупки" onClick={() => setPage("purchases")}>
          <Metrics
            entries={[
              [stats.count, "Всего покупок"],
              [fmt(stats.volume) + " TON", "Объём покупок"],
            ]}
          />
        </SectionLink>
        <h3>Инструменты</h3>
        <div className="tools-grid">
          <SectionLink
            title="Мои рефералы"
            onClick={() => setPage("referrals")}
          >
            <Metrics
              entries={[
                [fmt(tools?.referrals?.firstLevel), "Рефералов"],
                [fmt(tools?.referrals?.earned), "Заработано"],
              ]}
            />
          </SectionLink>
          <SectionLink title="API доступ" onClick={() => setPage("api")}>
            <small>Управление API-ключом</small>
            <span className="action-text">Открыть →</span>
          </SectionLink>
        </div>
        <SectionLink title="FAQ" onClick={() => setPage("faq")} />
      </>
    );
  if (page === "levels")
    return (
      <>
        {back}
        <h1>Уровни</h1>
        <section className="panel">
          <h2>
            {info.current.level} уровень · {fmt(stats.xp)} XP
          </h2>
          <p className="hint">
            Опыт только по собственным подтверждённым покупкам.
          </p>
          <div className="progress">
            <i style={{ width: info.progress + "%" }} />
          </div>
          <small>До следующего уровня: {fmt(info.remaining)} XP</small>
        </section>
        <h3>Мои условия · справочник оригинала</h3>
        <section className="panel">
          <Metrics
            entries={[
              [fmt(info.current.fee) + "%", "Комиссия"],
              [fmt(info.current.cashback) + "%", "Кэшбек"],
            ]}
          />
          <p className="hint">
            Собственные комиссии и выплаты ещё не подключены.
          </p>
        </section>
        <h3>Все уровни</h3>
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Комиссия</th>
                <th>Объём XP</th>
                <th>Кэшбек</th>
              </tr>
            </thead>
            <tbody>
              {[...levels].reverse().map((l) => (
                <tr
                  key={l.level}
                  className={
                    l.level === info.current.level ? "current-level" : ""
                  }
                >
                  <td>{l.level}</td>
                  <td>{fmt(l.fee)}%</td>
                  <td>{fmt(l.xp)}</td>
                  <td>{fmt(l.cashback)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (page === "purchases") {
    const filtered = filterPurchases(purchases, {
        collection,
        number,
        from,
        to,
        hideSold,
      }),
      list = paginate(filtered, p),
      s = purchaseStats(filtered);
    return (
      <>
        {back}
        <h1>Мои покупки</h1>
        <section className="panel">
          <Metrics
            entries={[
              [s.count, "Всего покупок"],
              [fmt(s.volume) + " TON", "Объём покупок"],
              [fmt(s.hold) + " TON", "Сумма в холде"],
              [fmt(s.profit) + " TON", "Подтверждённая прибыль"],
            ]}
          />
        </section>
        <div className="purchase-filters">
          <select
            aria-label="Коллекция покупок"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
          >
            <option value="">Все коллекции</option>
            {[...new Set(purchases.map((p) => p.collection))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            aria-label="Номер покупки"
            placeholder="Номер подарка"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <label>
            С даты
            <input
              aria-label="Покупки с даты"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            По дату
            <input
              aria-label="Покупки по дату"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <Switch
          label="Скрыть проданные"
          value={hideSold}
          onChange={setHideSold}
        />
        {!filtered.length ? (
          <section className="panel empty">
            Покупок по этим фильтрам нет.
          </section>
        ) : (
          list.rows.map((p) => (
            <section className="panel purchase-card" key={p.id}>
              <div className="row">
                <GiftVisual collection={p.collection} model={p.model} backdrop={p.backdrop} symbol={p.symbol} />
                <div className="grow">
                  <h2>
                    {p.collection} #{p.number}
                  </h2>
                  <small>
                    {p.market} · {new Date(p.createdAt).toLocaleString("ru-RU")}
                  </small>
                </div>
                <span className="badge">
                  {p.status === "sold"
                    ? "Продан"
                    : p.status === "confirmed"
                      ? "Куплен"
                      : "Ожидает"}
                </span>
              </div>
              <div className="detail-lines">
                <p>
                  Цена подарка <b>{fmt(p.priceTon)} TON</b>
                </p>
                <p>
                  Комиссия <b>{fmt(p.feeTon)} TON</b>
                </p>
                <p>
                  Всего списано <b>{fmt(p.totalTon)} TON</b>
                </p>
                <p>
                  Цена продажи <b>{fmt(p.saleTon)} TON</b>
                </p>
              </div>
            </section>
          ))
        )}
        <Pager {...list} onChange={setP} />
      </>
    );
  }
  if (page === "wallet")
    return (
      <>
        {back}
        <h1>Баланс</h1>
        <SectionLink
          title="Кошелёк не подключён"
          onClick={() =>
            notify(
              "Подключение TON-кошелька будет доступно после настройки собственного платёжного сервиса.",
            )
          }
        >
          <span className="action-text">Подключить →</span>
        </SectionLink>
        <section className="panel empty">
          <small>Баланс кошелька приложения</small>
          <div className="big">{fmt(data.balance)} TON</div>
          <div className="row">
            <button className="primary grow" onClick={() => setPage("deposit")}>
              Пополнить
            </button>
            <button className="grow" onClick={() => setPage("withdraw")}>
              Вывести
            </button>
          </div>
          <p className="hint">Платёжный сервис ещё не подключён.</p>
        </section>
        <section className="panel">
          <h2>Обмен Stars</h2>
          <p className="hint">Продажа Stars на баланс приложения</p>
          <div className="row">
            <button className="primary grow" onClick={() => setPage("stars")}>
              Продать Stars
            </button>
            <button className="grow" onClick={() => setPage("stars")}>
              Посмотреть курс
            </button>
          </div>
        </section>
        <h3>История</h3>
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Тип операции</th>
                <th>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(tools?.transactions || []).map((t) => (
                <tr key={t.id}>
                  <td>
                    {t.type}
                    <small>{new Date(t.date).toLocaleString("ru-RU")}</small>
                  </td>
                  <td>
                    {fmt(t.amount)} {t.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tools?.transactions?.length && (
            <p className="empty">Подтверждённых операций нет.</p>
          )}
          <Pager page={1} pages={1} onChange={() => {}} />
        </section>
      </>
    );
  if (page === "deposit" || page === "withdraw")
    return (
      <>
        {back}
        <h1>{page === "deposit" ? "Пополнение" : "Вывод"}</h1>
        <section className="panel form">
          <label>
            Сумма, TON
            <input
              aria-label="Сумма операции"
              type="number"
              min="0"
              step=".01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          {page === "withdraw" && (
            <label>
              Адрес кошелька
              <input
                aria-label="Адрес вывода"
                placeholder="Адрес TON-кошелька"
                autoComplete="off"
              />
            </label>
          )}
          <p className="hint">
            Комиссия: — · Доступно: {fmt(data.balance)} TON
          </p>
          <button className="primary full" disabled>
            {page === "deposit" ? "Пополнить" : "Вывести"}
          </button>
          <p className="hint">
            Адрес пополнения и отправка средств появятся после настройки
            собственного сервиса расчётов.
          </p>
        </section>
      </>
    );
  if (page === "stars")
    return (
      <>
        {back}
        <h1>Обмен Stars</h1>
        <p className="hint">Рассчитайте стоимость перед обменом</p>
        <h3>Калькулятор</h3>
        <section className="panel form">
          <label>
            Вы отдаёте, Stars
            <input
              aria-label="Количество Stars"
              type="number"
              min="0"
              step="1"
              value={stars}
              onChange={(e) => setStars(e.target.value)}
            />
          </label>
          <small>Вы получаете</small>
          <div className="big">{fmt(estimate?.ton)} TON</div>
          <p>{fmt(estimate?.usdt)} USDT</p>
          <Switch label="Вычесть 20%" value={deduct} onChange={setDeduct} />
          <div className="detail-lines">
            <p>
              Курс за 1 Star <b>{fmt(rates.starsUsdt)} USDT</b>
            </p>
            <p>
              Использовано за 30 дней{" "}
              <b>
                {fmt(rates.used)} / {fmt(rates.monthlyLimit)}
              </b>
            </p>
          </div>
        </section>
        <section className="panel">
          <h2>Как обменять</h2>
          <p className="hint">
            Собственный курс и канал приёма Stars ещё не настроены. Отправлять
            Stars в канал исходного сервиса для пополнения этой версии нельзя:
            средства не попадут на ваш собственный баланс.
          </p>
          <button className="primary full" disabled>
            Обменять Stars
          </button>
        </section>
      </>
    );
  if (page === "staking")
    return (
      <>
        {back}
        <h1>Стейкинг подарков</h1>
        <section className="panel violet">
          <small>Следующее распределение · 00:00 UTC+3</small>
          <div className="big">
            {clock.hours}ч {clock.minutes}м
          </div>
          <Metrics
            entries={[
              [fmt(tools?.staking?.giftRewards), "Ваши начисления"],
              [
                fmt(tools?.staking?.gifts?.length || null),
                "Подарков в стейкинге",
              ],
            ]}
          />
        </section>
        <h3>Подходящие подарки</h3>
        {["Lol Pop", "Ionic Dryer"].map((c) => (
          <section className="panel" key={c}>
            <div className="row">
              <GiftVisual collection={c} model="Satellite" />
              <div>
                <h2>{c}</h2>
                <small>Модель Satellite</small>
              </div>
            </div>
            <p className="hint">
              Проверка наличия подарка в Telegram-профиле · шесть раз в день по
              правилам оригинала.
            </p>
            <button className="full" disabled>
              Проверить подарки
            </button>
          </section>
        ))}
        <p className="hint">
          Проверка владения и собственный фонд вознаграждений ещё не подключены.
        </p>
      </>
    );
  if (page === "usdt")
    return (
      <>
        {back}
        <h1>USDT Стейкинг</h1>
        <section className="panel">
          <Metrics
            entries={[
              [fmt(tools?.staking?.usdt) + " USDT", "Застейкано"],
              [fmt(tools?.staking?.earned) + " USDT", "Заработано"],
            ]}
          />
          <div className="detail-lines">
            <p>
              APR <b>{fmt(tools?.staking?.apr)}%</b>
            </p>
            <p>
              Заполнение пула{" "}
              <b>
                {fmt(tools?.staking?.poolUsed)} /{" "}
                {fmt(tools?.staking?.poolLimit)} USDT
              </b>
            </p>
          </div>
          <div className="row">
            <button className="primary grow" disabled>
              Внести
            </button>
            <button className="grow" disabled>
              Вывести
            </button>
          </div>
        </section>
        <p className="hint">
          Доходность исходного сервиса не переносится в личную версию. Приём
          вкладов и выплаты пока не подключены.
        </p>
      </>
    );
  if (page === "referrals")
    return (
      <>
        {back}
        <h1>Мои рефералы</h1>
        <section className="panel">
          <Metrics
            entries={[
              [fmt(tools?.referrals?.firstLevel), "Первый уровень"],
              [fmt(tools?.referrals?.secondLevel), "Второй уровень"],
              [fmt(tools?.referrals?.earned) + " TON", "Заработано"],
            ]}
          />
        </section>
        <h3>Пригласительная ссылка</h3>
        <section className="panel">
          <input
            aria-label="Реферальная ссылка"
            readOnly
            value={tools?.referrals?.link || ""}
            placeholder="Реферальная система ещё не подключена"
          />
          <button
            className="primary full"
            disabled={!tools?.referrals?.link}
            onClick={() =>
              navigator.clipboard
                .writeText(tools.referrals.link)
                .then(() => notify("Ссылка скопирована"))
                .catch(() => notify("Не удалось скопировать ссылку"))
            }
          >
            Скопировать
          </button>
        </section>
        <p className="hint">
          Приложение закрыто для единственного владельца. Двухуровневые
          начисления потребуют отдельного учёта приглашений и источника выплат.
        </p>
      </>
    );
  if (page === "api")
    return (
      <>
        {back}
        <h1>API доступ</h1>
        <section className="panel">
          <span className={"badge " + (access?.enabled ? "success" : "")}>
            {access?.enabled ? "ВКЛ" : "ВЫКЛ"}
          </span>
          <h2>Личный API-ключ</h2>
          <p className="hint">
            Текущая область доступа: чтение ваших подписок. Покупки и управление
            средствами через внешний API пока недоступны.
          </p>
          {access?.createdAt && (
            <small>
              Создан {new Date(access.createdAt).toLocaleString("ru-RU")}
            </small>
          )}
          <button
            className="primary full"
            disabled={accessBusy || !access}
            onClick={() => setConfirm("create")}
          >
            {access?.enabled ? "Заменить ключ" : "Активировать"}
          </button>
          {access?.enabled && (
            <button
              className="danger full"
              disabled={accessBusy}
              onClick={() => setConfirm("revoke")}
            >
              Отозвать ключ
            </button>
          )}
        </section>
        {secret && (
          <section className="panel">
            <h2>Новый ключ</h2>
            <p className="hint">
              Скопируйте сейчас: сервер хранит только хеш. При уходе с экрана
              ключ больше не показывается.
            </p>
            <input
              aria-label="Новый API-ключ"
              type="password"
              readOnly
              value={secret}
            />
            <button
              className="full"
              onClick={() =>
                navigator.clipboard
                  .writeText(secret)
                  .then(() => notify("Ключ скопирован"))
                  .catch(() => notify("Не удалось скопировать ключ"))
              }
            >
              Скопировать ключ
            </button>
          </section>
        )}
        <section className="panel">
          <h2>Чтение подписок</h2>
          <code className="code">
            GET /api/external/subscriptions
            <br />
            Authorization: Bearer YOUR_KEY
          </code>
        </section>
        {confirm && (
          <section
            className="panel confirmation"
            role="dialog"
            aria-label="Подтверждение API-ключа"
          >
            <p>
              {confirm === "create"
                ? "Создать ключ для чтения ваших подписок? Предыдущий ключ перестанет работать."
                : "Отозвать доступ по текущему ключу?"}
            </p>
            <div className="row">
              <button className="grow" onClick={() => setConfirm("")}>
                Отмена
              </button>
              <button
                className="primary grow"
                disabled={accessBusy}
                onClick={() =>
                  accessAction(confirm === "create" ? "POST" : "DELETE")
                }
              >
                Подтвердить
              </button>
            </div>
          </section>
        )}
      </>
    );
  if (page === "faq")
    return (
      <>
        {back}
        <h1>FAQ</h1>
        {faqs.map(([q, a]) => (
          <details className="panel faq" key={q}>
            <summary>{q}</summary>
            <p className="hint">{a}</p>
          </details>
        ))}
      </>
    );
  return null;
}
