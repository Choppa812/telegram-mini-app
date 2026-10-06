import React from "react";
import {BackdropSwatch} from "./GiftVisual.jsx";
import { Switch, faqs } from "./AccountPages.jsx";
export default function SettingsPage({
  settings,
  config,
  catalog,
  data,
  onModal,
  onPage,
}) {
  return (
    <>
      <h1>Настройки</h1>
      <h3>Ежедневная оценка цен</h3>
      <section className="panel">
        <Switch label="Пересчитывать цену покупки каждый день"
          value={settings.dailyPricing !== false} onChange={v => config("dailyPricing", v)} />
        <p>Минимальная цена коллекции или комбинации с Black минус минимум 5 GRAM.
          При слабом спросе запас увеличивается до 25% минимума.</p>
        <p className="hint">Капитал: 50 GRAM · планируемый резерв: 10 GRAM · одна покупка с комиссией: до 10 GRAM.
          Для оценки нужны подтверждённые продажи за полные сутки или больше.
          Устаревшие данные, неизвестные комиссии и слишком редкие продажи блокируют покупку.</p>
        <p role="status">{data.pricing?.connected ?
          (data.pricing.stale ? "Цены требуют обновления" : "Пороги рассчитаны") :
          "Ожидается подключение источника цен и продаж"}</p>
        {data.pricing?.lastSuccess && <p className="hint">Последний пересчёт: {
          new Date(data.pricing.lastSuccess).toLocaleString("ru-RU", {timeZone: "Europe/Moscow"})} МСК</p>}
        {data.pricing?.error && <p className="hint">{data.pricing.error}</p>}
        {data.pricing?.rules?.length > 0 && <details>
          <summary>Минимумы и пороги ({data.pricing.rules.length})</summary>
          {data.pricing.rules.map(r => <div className="panel" key={JSON.stringify([r.collection,r.backdrop,r.model])}>
            <strong>{r.collection} · {r.backdrop === "*" ? "Все фоны" : r.backdrop} · {r.model === "*" ? "Все модели" : r.model}</strong>
            <p>Минимум: {r.floorGram ?? "—"} GRAM · покупка до: {data.pricing.stale ? "—" : r.buyLimitGram ?? "—"} GRAM</p>
            <small>{data.pricing.stale ? "Данные устарели; покупка заблокирована" : r.reason}</small>
          </div>)}
        </details>}
      </section>
      <h3>Язык</h3>
      <div className="chips languages">
        {[
          ["ru", "Русский"],
          ["en", "English"],
          ["zh", "中文"],
          ["fa", "فارسی"],
          ["uz", "O‘zbekcha"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={settings.language === value ? "selected" : ""}
            onClick={() => config("language", value)}
          >
            {label}
          </button>
        ))}
      </div>
      {settings.language !== "ru" && (
        <p className="hint">
          Предпочтение сохранено. Полный перевод интерфейса ещё готовится.
        </p>
      )}
      <h3>Подписки</h3>
      <section className="panel">
        <Switch
          label="Включить автопокупку"
          value={settings.autoBuy}
          disabled={!data.autoBuyAvailable}
          onChange={(v) => config("autoBuy", v)}
        />
        <Switch
          label="Включить уведомления"
          value={settings.notifications}
          onChange={(v) => config("notifications", v)}
        />
        <Switch
          label="Включить уведомления о продажах"
          value={settings.salesNotifications}
          onChange={(v) => config("salesNotifications", v)}
        />
        <p className="hint">
          Уведомления о продажах сопоставляются с фильтрами подписок при наличии
          источника продаж.
        </p>
        <button className="danger full" onClick={() => onModal("deleteAll")}>
          Удалить ВСЕ подписки
        </button>
      </section>
      <h3>Предпочтения</h3>
      <section className="panel">
        <div className="row heading-row">
          <h2>Мои исключения</h2>
          <button onClick={() => onModal("exclusions")}>Добавить</button>
        </div>
        <p className="hint">Исключите выбранные коллекции из поиска.</p>
        <div className="chips">
          {settings.exclusions.map((x) => (
            <button
              key={x}
              onClick={() =>
                config(
                  "exclusions",
                  settings.exclusions.filter((v) => v !== x),
                )
              }
            >
              {x} ×
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="row heading-row">
          <h2>Мои пресеты фонов</h2>
          <button onClick={() => onModal("preset")}>Добавить</button>
        </div>
        <p className="hint">
          Сохраните набор фонов и применяйте его при создании фильтра.
        </p>
        {settings.presets.map((preset, index) => (
          <div className="preset-card" key={index}>
            <h2>{preset.name}</h2>
            <div className="chips">
              {preset.values.map((v) => (
                <span key={v}><BackdropSwatch name={v} />{v}</span>
              ))}
            </div>
            <div className="row">
              <button
                className="grow"
                onClick={() => onModal({ editPreset: index })}
              >
                Изменить
              </button>
              <button
                aria-label={"Удалить пресет " + preset.name}
                onClick={() =>
                  config(
                    "presets",
                    settings.presets.filter((_, i) => i !== index),
                  )
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </section>
      <h3>Подключения</h3>
      <section className="panel">
        {["Telegram", "Portals", "MRKT", "Tonnel", "Getgems"].map((m) => (
          <div className="connection" key={m}>
            <span>{m}</span>
            <small>
              {data.markets.includes(m) ? "Данные доступны" : "Не подключено"}
            </small>
          </div>
        ))}
      </section>
      <h3>FAQ</h3>
      {faqs.slice(0, 4).map(([q, a]) => (
        <details className="panel faq" key={q}>
          <summary>{q}</summary>
          <p className="hint">{a}</p>
        </details>
      ))}
      <button className="full" onClick={() => onPage("faq")}>
        Все вопросы →
      </button>
    </>
  );
}
