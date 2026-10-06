import GiftVisual, {BackdropSwatch, SymbolVisual} from "./GiftVisual.jsx";
import React, { useState, useEffect } from "react";
import "./style.css";
import AccountPages, { Switch, Pager } from "./AccountPages.jsx";
import SettingsPage from "./SettingsPage.jsx";
import { CollectionPicker, AttributePicker, PresetEditor } from "./Pickers.jsx";
import {
  fmt,
  filterSubscriptions,
  priceWithinLimit,
  levelInfo,
  purchaseStats,
  paginate,
} from "./domain.js";
const markets = ["Telegram", "Portals", "MRKT", "Tonnel", "Getgems"];
const fresh = () => ({
  name: "",
  collection: "Lol Pop",
  models: [],
  backdrops: [],
  symbols: [],
  number: "",
  buy: false,
  buyLimit: "",
  quantity: 1,
  buyMarkets: markets.slice(0, 4),
  notifyPrice: false,
  notifyNew: false,
  notifyLimit: "",
  notifyMarkets: markets,
  enabled: true,
});
let localSession = "";
async function api(path, body, method) {
  const r = await fetch("/api/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      "X-Local-Session": localSession,
      "X-Telegram-Init-Data": window.Telegram?.WebApp?.initData || "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Ошибка запроса");
  return d;
}
function Choice({ value, onChange, choices = markets }) {
  return (
    <div className="chips">
      {choices.map((m) => (
        <button
          key={m}
          className={value.includes(m) ? "selected" : ""}
          onClick={() =>
            onChange(
              value.includes(m) ? value.filter((v) => v !== m) : [...value, m],
            )
          }
        >
          {m}
        </button>
      ))}
    </div>
  );
}
function Modal({ title, close, children }) {
  useEffect(() => {
    const f = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [close]);
  return (
    <div className="overlay" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row">
          <h2>{title}</h2>
          <button aria-label="Закрыть" onClick={close}>
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export default function App() {
  const [page, P] = useState("search"),
    [data, D] = useState(null),
    [catalog, C] = useState([]),
    [subs, S] = useState([]),
    [form, F] = useState(fresh),
    [id, I] = useState(null),
    [modal, M] = useState(null),
    [query, Q] = useState(""),
    [filter, T] = useState("all"),
    [offers, O] = useState(null),
    [sales, A] = useState([]),
    [saleSort, Z] = useState("date"),
    [notice, N] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [settings, U] = useState({
      notifications: true,
      exclusions: [],
      presets: [],
    }),
    [purchases, H] = useState([]),
    [tools, K] = useState(null),
    [subCollection, SC] = useState(""),
    [subBackdrop, SB] = useState(""),
    [saleMarket, SM] = useState(""),
    [salePage, SP] = useState(1),
    [starsOnly, SO] = useState(false);
  const set = (k, v) => F((f) => ({ ...f, [k]: v }));
  const run = async (fn) => {
    B(true);
    try {
      await fn();
    } catch (e) {
      N(e.message);
    } finally {
      B(false);
    }
  };
  const refresh = async () => {
    const [a, b, c, d, e] = await Promise.all([
      api("status"),
      api("subscriptions"),
      api("settings"),
      api("purchases"),
      api("tools"),
    ]);
    D(a);
    S(b);
    U(c);
    H(d);
    K(e);
  };
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    if (tg?.isVersionAtLeast?.("6.1")) {
      tg.setHeaderColor("#111111");
      tg.setBackgroundColor("#000000");
    }
    (async () => {
      try {
        if (!tg?.initData) {
          const r = await fetch("/api/local-session");
          if (r.ok) localSession = (await r.json()).session;
        }
        await refresh();
        C(await api("catalog"));
      } catch (e) {
        E(e.message);
      }
    })();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => N(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  const config = (k, v) =>
    run(async () => {
      const updated = { ...settings, [k]: v };
      const saved = await api("settings", updated, "PUT");
      U(saved);
    });
  const save = () =>
    run(async () => {
      await api(
        "subscriptions" + (id ? "/" + id : ""),
        { ...form, name: form.name || form.collection },
        id ? "PUT" : "POST",
      );
      await refresh();
      P("subscriptions");
      N("Подписка сохранена");
    });
  const newSub = () => {
    I(null);
    F(fresh());
    O(null);
    P("search");
  };
  const attributes = catalog.find((c) => c.name === form.collection) || {};
  const filteredSubs = filterSubscriptions(subs, {
    query,
    status: filter,
    collection: subCollection,
    backdrop: subBackdrop,
  });
  const backgroundOptions = [
    ...new Set(catalog.flatMap((c) => c.backdrops || [])),
  ];
  const saleList = paginate(
    [...sales]
      .filter((s) => !saleMarket || s.market === saleMarket)
      .sort((a, b) =>
        saleSort === "price"
          ? a.priceTon - b.priceTon
          : Date.parse(b.date) - Date.parse(a.date),
      ),
    salePage,
  );
  const activeNav = ["subscriptions", "search"].includes(page)
    ? page
    : "profile";
  if (error)
    return (
      <div className="app">
        <main>
          <section className="panel">
            <h1>GiftAutoBuyer</h1>
            <p>{error}</p>
            <p>Откройте приложение из своего Telegram-бота.</p>
            <button onClick={() => location.reload()}>Повторить</button>
          </section>
        </main>
      </div>
    );
  if (!data)
    return (
      <div className="app">
        <p className="empty">Загрузка…</p>
      </div>
    );
  return (
    <div className="app">
      <header>
        <button
          className="logo"
          aria-label="Главная"
          onClick={() => P("search")}
        >
          ✦
        </button>
        <div className="row">
          <button aria-label="История покупок" onClick={() => P("purchases")}>
            ▥
          </button>
          <button onClick={() => P("wallet")}>◈ {fmt(data.balance)} +</button>
          <button aria-label="Настройки" onClick={() => P("settings")}>
            ⚙
          </button>
        </div>
      </header>
      <main>
        <div className="service">
          <i className={data.marketConnected ? "live" : ""} />
          {data.marketConnected
            ? "Данные площадок доступны"
            : "Площадки ещё не подключены"}
          {data.localPreview && <small>Локальный просмотр</small>}
        </div>
        {page === "search" && (
          <>
            <div className="row collection">
              <button
                aria-label="Предыдущая коллекция"
                onClick={() => {
                  const i = catalog.findIndex(
                    (c) => c.name === form.collection,
                  );
                  const c = catalog[(i + catalog.length - 1) % catalog.length];
                  if (c) {
                    F({ ...fresh(), collection: c.name });
                    O(null);
                  }
                }}
              >
                ‹
              </button>
              <button className="grow" onClick={() => M("collection")}>
                <GiftVisual collection={form.collection} />
                {form.collection === "*" ? "Все коллекции" : form.collection} ⌄
              </button>
              <button
                aria-label="Следующая коллекция"
                onClick={() => {
                  const i = catalog.findIndex(
                    (c) => c.name === form.collection,
                  );
                  const c = catalog[(i + 1) % catalog.length];
                  if (c) {
                    F({ ...fresh(), collection: c.name });
                    O(null);
                  }
                }}
              >
                ›
              </button>
            </div>
            <h3>Фильтры</h3>
            <input
              aria-label="Номер или паттерн"
              placeholder="Номер или паттерн (напр. AAA, ABABAB)"
              value={form.number}
              onChange={(e) => set("number", e.target.value)}
            />
            <div className="filters">
              {[
                ["models", "модели"],
                ["backdrops", "фоны"],
                ["symbols", "узоры"],
              ].map(([k, l]) => (
                <button key={k} onClick={() => M(k)}>
                  {form[k].length ? `${form[k].length} выбрано` : `Все ${l}`} ⌄
                </button>
              ))}
            </div>
            {["models", "backdrops", "symbols"].map(
              (k) =>
                form[k].length > 0 && (
                  <div key={k} className="chips">
                    {form[k].map((v) => (
                      <button
                        key={v}
                        onClick={() =>
                          set(
                            k,
                            form[k].filter((x) => x !== v),
                          )
                        }
                      >
                        {k === 'backdrops' && <BackdropSwatch name={v} />}
                        {k === 'symbols' && <SymbolVisual name={v} />}
                        {k === 'models' && <GiftVisual collection={form.collection} model={v} />}
                        {v} ×
                      </button>
                    ))}
                    <button onClick={() => set(k, [])}>Очистить</button>
                  </div>
                ),
            )}
            <div className="row">
              <button
                disabled={busy}
                className="primary grow"
                onClick={() => run(async () => O(await api("search", form)))}
              >
                Получить цены
              </button>
              <button
                disabled={busy}
                className="grow"
                onClick={() =>
                  run(async () => {
                    A(await api("sales", form));
                    SP(1);
                    M("sales");
                  })
                }
              >
                Смотреть продажи
              </button>
            </div>
            <div className="floors">
              {["Floors", "Onyx Floors", "Black Floors"].map((t, i) => (
                <div key={t}>
                  <small>{t}</small>
                  {["Portals", "MRKT"].map((m) => (
                    <p key={m}>
                      {m}
                      <b>{fmt(offers?.floors?.[i]?.[m])}</b>
                    </p>
                  ))}
                </div>
              ))}
            </div>
            {offers && (
              <>
                <h3>Предложения · {offers.offers.length}</h3>
                {!offers.offers.length ? (
                  <div className="panel empty">
                    {offers.connected
                      ? "Подходящих предложений нет"
                      : "Для реальных цен подключите источники данных."}
                  </div>
                ) : (
                  markets.map((m) => {
                    const list = offers.offers.filter(
                      (o) =>
                        o.market === m &&
                        (!starsOnly ||
                          m !== "Telegram" ||
                          o.priceStars != null),
                    );
                    return (
                      !!list.length && (
                        <section key={m}>
                          <h2>{m}</h2>
                          {m === "Telegram" && (
                            <Switch
                              label="Только за Stars"
                              value={starsOnly}
                              onChange={SO}
                            />
                          )}
                          <div className="offers">
                            {list.map((o) => (
                              <button
                                key={o.id}
                                onClick={() => M({ offer: o })}
                              >
                                <GiftVisual className="gift-tile" collection={o.collection || form.collection} model={o.model} backdrop={o.backdrop} symbol={o.symbol} image={o.imageUrl} />
                                <small>#{o.number}</small>
                                <b>◈ {fmt(o.priceTon)}</b>
                                {o.priceStars != null && (
                                  <small>★ {fmt(o.priceStars)}</small>
                                )}
                                <small>
                                  {o.model} · {o.backdrop}
                                </small>
                              </button>
                            ))}
                          </div>
                        </section>
                      )
                    );
                  })
                )}
              </>
            )}
            <h3>{id ? "Изменение подписки" : "Создание подписки"}</h3>
            <input
              aria-label="Название подписки"
              placeholder="Отображается в push-уведомлении"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            <section className="panel form">
              <Switch
                label="Покупки"
                value={form.buy}
                disabled={!data.autoBuyAvailable}
                onChange={(v) => set("buy", v)}
              />
              <p className="hint">
                Покупать автоматически при появлении. Торговые API ещё не
                подключены.
              </p>
              <Choice
                choices={markets.slice(0, 4)}
                value={form.buyMarkets}
                onChange={(v) => set("buyMarkets", v)}
              />
              <label>
                Максимальная цена покупки, TON
                <div className="row">
                  <button
                    onClick={() =>
                      set(
                        "buyLimit",
                        String((Number(form.buyLimit) * 0.9).toFixed(4)),
                      )
                    }
                  >
                    −10%
                  </button>
                  <input
                    aria-label="Максимальная цена покупки"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.buyLimit}
                    onChange={(e) => set("buyLimit", e.target.value)}
                  />
                  <button
                    onClick={() =>
                      set(
                        "buyLimit",
                        String((Number(form.buyLimit) * 1.1).toFixed(4)),
                      )
                    }
                  >
                    +10%
                  </button>
                </div>
              </label>
              {priceWithinLimit(
                form.buyLimit,
                levelInfo(purchaseStats(purchases).xp).current.fee,
              ) != null && (
                <p className="hint">
                  Цена подарка до{" "}
                  {fmt(
                    priceWithinLimit(
                      form.buyLimit,
                      levelInfo(purchaseStats(purchases).xp).current.fee,
                    ),
                  )}{" "}
                  TON при комиссии справочника{" "}
                  {fmt(levelInfo(purchaseStats(purchases).xp).current.fee)}%.
                  Реальные комиссии пока не подключены.
                </p>
              )}
              <label>
                Количество подарков
                <input
                  aria-label="Количество подарков"
                  type="number"
                  min="1"
                  max="1000"
                  value={form.quantity}
                  onChange={(e) => set("quantity", Number(e.target.value))}
                />
              </label>
              <Switch
                label="Уведомления об изменении цен"
                value={form.notifyPrice}
                onChange={(v) => set("notifyPrice", v)}
              />
              <p className="hint">Получать уведомления при изменении</p>
              {(form.notifyPrice || form.notifyNew) && (
                <>
                  <Choice
                    value={form.notifyMarkets}
                    onChange={(v) => set("notifyMarkets", v)}
                  />
                  <label>
                    Максимальная цена уведомления, TON
                    <input
                      aria-label="Максимальная цена уведомления"
                      type="number"
                      min="0"
                      step="0.001"
                      value={form.notifyLimit}
                      onChange={(e) => set("notifyLimit", e.target.value)}
                    />
                  </label>
                </>
              )}
              <Switch
                label="Уведомления о новых"
                value={form.notifyNew}
                onChange={(v) => set("notifyNew", v)}
              />
              <p className="hint">
                Уведомлять при появлении подходящего подарка
              </p>
            </section>
            <button className="primary full" disabled={busy} onClick={save}>
              {id ? "Сохранить" : "Создать"}
            </button>
          </>
        )}
        {page === "subscriptions" && (
          <>
            <input
              aria-label="Поиск подписок"
              placeholder="Поиск…"
              value={query}
              onChange={(e) => Q(e.target.value)}
            />
            <div className="row">
              <select
                aria-label="Статус подписок"
                value={filter}
                onChange={(e) => T(e.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="active">Активные</option>
                <option value="paused">На паузе</option>
              </select>
              <button className="primary grow" onClick={newSub}>
                Добавить подписку
              </button>
            </div>
            <div className="row subscription-filters">
              <select
                aria-label="Коллекция подписок"
                value={subCollection}
                onChange={(e) => SC(e.target.value)}
              >
                <option value="">Все коллекции</option>
                {[...new Set(subs.map((s) => s.collection))].map((c) => (
                  <option key={c} value={c}>
                    {c === "*" ? "Все коллекции" : c}
                  </option>
                ))}
              </select>
              <select
                aria-label="Фон подписок"
                value={subBackdrop}
                onChange={(e) => SB(e.target.value)}
              >
                <option value="">Все фоны</option>
                {[...new Set(subs.flatMap((s) => s.backdrops))].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <button className="full slots-link" onClick={() => M("slots")}>
              Слоты подписок · без ограничений ›
            </button>
            <p className="hint">
              Создано {subs.length} подписок · Без лимита слотов
            </p>
            {!subs.length && (
              <div className="panel empty">
                Подписок пока нет.
                <br />
                Создайте фильтр в разделе «Поиск».
              </div>
            )}
            {!!subs.length && !filteredSubs.length && (
              <div className="panel empty">Подписок по этим фильтрам нет.</div>
            )}
            {filteredSubs.map((s) => (
              <section className="panel" key={s.id}>
                <div className="row">
                  <GiftVisual collection={s.collection} model={s.models?.length===1?s.models[0]:null} backdrop={s.backdrops?.length===1?s.backdrops[0]:null} />
                  <div className="grow">
                    <h2>{s.name}</h2>
                    <small>
                      {s.collection === "*" ? "Все коллекции" : s.collection}
                    </small>
                  </div>
                  <Switch
                    label=""
                    value={s.enabled}
                    onChange={(v) =>
                      run(async () => {
                        await api(
                          "subscriptions/" + s.id,
                          { ...s, enabled: v },
                          "PUT",
                        );
                        await refresh();
                      })
                    }
                  />
                </div>
                <div className="chips">
                  {[
                    s.models.length
                      ? `${s.models.length} моделей`
                      : "Все модели",
                    s.backdrops.join(", ") || "Все фоны",
                    s.symbols.length
                      ? `${s.symbols.length} узоров`
                      : "Все узоры",
                    s.number || "Любой номер",
                  ].map((x, index) => (
                    <span key={x}>{index === 1 && s.backdrops.map(name => <BackdropSwatch key={name} name={name} />)}{x}</span>
                  ))}
                </div>
                <div className="metrics">
                  <div>
                    <small>Покупка</small>
                    <b>
                      ◈ {fmt(s.buyLimit)} · {s.quantity} шт.
                    </b>
                    <small>Не подключена</small>
                  </div>
                  <div>
                    <small>Уведомления</small>
                    <b>◈ {fmt(s.notifyLimit)}</b>
                    <small>
                      {s.notifyPrice || s.notifyNew ? "Включены" : "Выключены"}
                    </small>
                  </div>
                </div>
                <div className="row">
                  <button
                    className="grow"
                    onClick={() => {
                      I(s.id);
                      F({ ...s });
                      O(null);
                      P("search");
                    }}
                  >
                    Изменить
                  </button>
                  <button
                    className="danger"
                    aria-label={"Удалить " + s.name}
                    onClick={() => M({ delete: s })}
                  >
                    ⌫
                  </button>
                </div>
              </section>
            ))}
          </>
        )}
        {page === "settings" && (
          <SettingsPage
            settings={settings}
            config={config}
            catalog={catalog}
            data={data}
            onModal={M}
            onPage={P}
          />
        )}
        {!["search", "subscriptions", "settings"].includes(page) && (
          <AccountPages
            key={page}
            page={page}
            setPage={P}
            data={data}
            purchases={purchases}
            tools={tools}
            api={api}
            run={run}
            notify={N}
          />
        )}
      </main>
      <nav>
        {[
          ["subscriptions", "▤", "Подписки"],
          ["search", "⌕", "Поиск"],
          ["profile", "●", "Профиль"],
        ].map(([p, i, t]) => (
          <button
            key={p}
            className={activeNav === p ? "active" : ""}
            onClick={() => P(p)}
          >
            <span>{i}</span>
            {t}
          </button>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {modal && (
        <Modal
          title={
            typeof modal === "object"
              ? modal.delete
                ? "Удалить подписку?"
                : modal.editPreset != null
                  ? "Изменить пресет"
                  : "Подарок"
              : {
                  collection: "Коллекции",
                  models: "Модели",
                  backdrops: "Фоны",
                  symbols: "Узоры",
                  sales: "История продаж",
                  preset: "Пресет фонов",
                  exclusions: "Мои исключения",
                  deleteAll: "Удалить все подписки?",
                  slots: "Слоты подписок",
                }[modal] || modal
          }
          close={() => M(null)}
        >
          {modal === "collection" && (
            <CollectionPicker
              catalog={catalog}
              exclusions={settings.exclusions}
              onSelect={(name) => {
                F({
                  ...fresh(),
                  collection: name,
                  name: name === "*" ? "Все коллекции" : name,
                });
                O(null);
                M(null);
              }}
            />
          )}
          {["models", "backdrops", "symbols"].includes(modal) && (
            <>
              <AttributePicker
                key={modal}
                kind={modal}
                collection={form.collection}
                attributes={attributes[modal] || []}
                selected={form[modal]}
                onChange={(values) => set(modal, values)}
                presets={settings.presets}
                offers={offers?.offers || []}
              />
              <button className="primary full" onClick={() => M(null)}>
                Готово
              </button>
            </>
          )}
          {modal === "sales" && (
            <>
              <div className="chips">
                {["", ...markets].map((m) => (
                  <button
                    key={m}
                    className={saleMarket === m ? "selected" : ""}
                    onClick={() => {
                      SM(m);
                      SP(1);
                    }}
                  >
                    {m || "Все"}
                  </button>
                ))}
              </div>
              <div className="row">
                <button
                  className={saleSort === "date" ? "selected" : ""}
                  onClick={() => {
                    Z("date");
                    SP(1);
                  }}
                >
                  По дате
                </button>
                <button
                  className={saleSort === "price" ? "selected" : ""}
                  onClick={() => {
                    Z("price");
                    SP(1);
                  }}
                >
                  По цене
                </button>
              </div>
              {!saleList.rows.length ? (
                <p className="empty">
                  Подтверждённых данных о продажах пока нет.
                </p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Gift</th>
                        <th>#</th>
                        <th>Модель</th>
                        <th>Фон</th>
                        <th>Узор</th>
                        <th>Цена</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saleList.rows.map((s) => (
                        <tr key={s.id}>
                          <td>
                            {s.collection}
                            <small>{s.market}</small>
                          </td>
                          <td>{s.number}</td>
                          <td>{s.model}</td>
                          <td>{s.backdrop}</td>
                          <td>{s.symbol || "—"}</td>
                          <td>{fmt(s.priceTon)} TON</td>
                          <td>{new Date(s.date).toLocaleString("ru-RU")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager {...saleList} onChange={SP} />
            </>
          )}
          {(modal === "preset" || modal.editPreset != null) && (
            <PresetEditor
              initial={
                modal.editPreset != null
                  ? settings.presets[modal.editPreset]
                  : { name: "", values: form.backdrops }
              }
              backdrops={backgroundOptions}
              save={(preset) =>
                run(async () => {
                  const next =
                    modal.editPreset != null
                      ? settings.presets.map((p, i) =>
                          i === modal.editPreset ? preset : p,
                        )
                      : [...settings.presets, preset];
                  U(
                    await api(
                      "settings",
                      { ...settings, presets: next },
                      "PUT",
                    ),
                  );
                  M(null);
                })
              }
            />
          )}
          {modal === "exclusions" && (
            <>
              <CollectionPicker
                catalog={catalog}
                exclusions={settings.exclusions}
                onSelect={(name) => {
                  if (name === "*") {
                    N("Выберите конкретную коллекцию");
                    return;
                  }
                  config("exclusions", [
                    ...new Set([...settings.exclusions, name]),
                  ]);
                  M(null);
                }}
              />
            </>
          )}
          {modal === "slots" && (
            <>
              <p>Всего создано {subs.length} подписок.</p>
              <p className="hint">
                Для личного приложения количество слотов не ограничено. Покупать
                дополнительные слоты у собственного бота не требуется.
              </p>
              <button
                className="primary full"
                onClick={() => {
                  M(null);
                  newSub();
                }}
              >
                Добавить подписку
              </button>
            </>
          )}
          {modal === "deleteAll" && (
            <>
              <p>
                Будут удалены {subs.length} подписок из текущего списка.
                Восстановление возможно только из резервной копии.
              </p>
              <button
                className="danger full"
                disabled={busy || !subs.length}
                onClick={() =>
                  run(async () => {
                    await api("subscriptions/bulk-delete", {
                      ids: subs.map((s) => s.id),
                    });
                    M(null);
                    await refresh();
                    N("Подписки удалены");
                  })
                }
              >
                Удалить {subs.length} подписок
              </button>
            </>
          )}
          {modal.delete && (
            <>
              <p>Удалить «{modal.delete.name}»?</p>
              <button
                disabled={busy}
                className="danger full"
                onClick={() =>
                  run(async () => {
                    await api(
                      "subscriptions/" + modal.delete.id,
                      null,
                      "DELETE",
                    );
                    M(null);
                    await refresh();
                  })
                }
              >
                Удалить
              </button>
            </>
          )}
          {modal.offer && (
            <>
              <GiftVisual className="gift-tile" collection={modal.offer.collection || form.collection} model={modal.offer.model} backdrop={modal.offer.backdrop} symbol={modal.offer.symbol} image={modal.offer.imageUrl} />
              <h2>
                {form.collection} #{modal.offer.number}
              </h2>
              <p>
                {modal.offer.model} · {modal.offer.backdrop}
              </p>
              <p>
                {modal.offer.market} · {fmt(modal.offer.priceTon)} TON
              </p>
              <button className="primary full" disabled>
                Покупка ещё не подключена
              </button>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
