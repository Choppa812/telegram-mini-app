import GiftVisual, {BackdropSwatch, SymbolVisual} from "./GiftVisual.jsx";
import React, { useState } from "react";
import { attributeName, fmt } from "./domain.js";
export function CollectionPicker({ catalog, exclusions = [], onSelect }) {
  const [query, Q] = useState("");
  return (
    <>
      <input
        autoFocus
        placeholder="Быстрый поиск…"
        aria-label="Поиск коллекции"
        value={query}
        onChange={(e) => Q(e.target.value)}
      />
      <button className="picker" onClick={() => onSelect("*")}>
        Все коллекции
      </button>
      <div className="collection-grid">
        {catalog
          .filter(
            (c) =>
              !exclusions.includes(c.name) &&
              c.name.toLowerCase().includes(query.toLowerCase()),
          )
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <button key={c.name} onClick={() => onSelect(c.name)}>
              <GiftVisual collection={c.name} />
              <span>{c.name}</span>
            </button>
          ))}
      </div>
    </>
  );
}
export function AttributePicker({
  kind,
  collection,
  attributes,
  selected,
  onChange,
  presets = [],
  offers = [],
}) {
  const [query, Q] = useState(""),
    [sort, Z] = useState("shade");
  const filtered = attributes.filter((a) =>
    attributeName(a).toLowerCase().includes(query.toLowerCase()),
  );
  const rows =
    kind === "backdrops" && sort === "name"
      ? [...filtered].sort((a, b) =>
          attributeName(a).localeCompare(attributeName(b)),
        )
      : filtered;
  const groups =
    kind === "models"
      ? [
          ...new Set(
            rows.map((r) =>
              typeof r === "object" ? (r.rarity ?? "unknown") : "unknown",
            ),
          ),
        ]
      : ["all"];
  const toggle = (v) =>
    onChange(
      selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v],
    );
  return (
    <>
      <input
        autoFocus
        placeholder="Поиск…"
        aria-label="Поиск атрибута"
        value={query}
        onChange={(e) => Q(e.target.value)}
      />
      {kind === "backdrops" && (
        <>
          <div className="row">
            <button
              className={sort === "shade" ? "selected" : ""}
              onClick={() => Z("shade")}
            >
              Оттенок
            </button>
            <button
              className={sort === "name" ? "selected" : ""}
              onClick={() => Z("name")}
            >
              Название
            </button>
            <button
              className={sort === "presets" ? "selected" : ""}
              onClick={() => Z("presets")}
            >
              Пресеты
            </button>
          </div>
          {sort === "presets" && (
            <div>
              {!presets.length && (
                <p className="empty">Создайте пресет в настройках.</p>
              )}
              {presets.map((p) => (
                <button
                  className="picker"
                  key={p.name}
                  onClick={() => onChange(p.values)}
                >
                  {p.name}
                  <span>{p.values.length}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {sort !== "presets" &&
        groups.map((group) => {
          const list =
            kind === "models"
              ? rows.filter(
                  (r) =>
                    (typeof r === "object"
                      ? (r.rarity ?? "unknown")
                      : "unknown") === group,
                )
              : rows;
          return (
            <section key={group}>
              <div className="row">
                <small className="grow">
                  {kind === "models"
                    ? group === "unknown"
                      ? "Без данных о редкости"
                      : `Редкость: ${group}%`
                    : `${rows.length} вариантов`}
                </small>
                <button
                  onClick={() =>
                    onChange([
                      ...new Set([...selected, ...list.map(attributeName)]),
                    ])
                  }
                >
                  Выбрать все
                </button>
              </div>
              <div
                className={
                  "attribute-grid"
                }
              >
                {list.map((row) => {
                  const name = attributeName(row),
                    prices = offers
                      .filter(
                        (o) =>
                          o[
                            kind === "models"
                              ? "model"
                              : kind === "backdrops"
                                ? "backdrop"
                                : "symbol"
                          ] === name,
                      )
                      .map((o) => o.priceTon);
                  return (
                    <button
                      key={name}
                      className={
                        "attribute-option " +
                        (selected.includes(name) ? "selected" : "")
                      }
                      aria-pressed={selected.includes(name)}
                      onClick={() => toggle(name)}
                    >
                      {kind === "models" && (
                        <GiftVisual className="gift-tile" collection={collection} model={name} />
                      )}
                      {kind === "backdrops" && <BackdropSwatch name={name} />}
                      {kind === "symbols" && <SymbolVisual name={name} />}
                      <span>{name}</span>
                      {kind === "models" && (
                        <small>
                          ◈ {fmt(prices.length ? Math.min(...prices) : null)}
                        </small>
                      )}
                      {selected.includes(name) && <b className="check">✓</b>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      {!attributes.length && (
        <p className="empty">Каталог этих атрибутов ещё не подключён.</p>
      )}
      <button className="full" onClick={() => onChange([])}>
        Очистить выбор
      </button>
    </>
  );
}
export function PresetEditor({
  initial = { name: "", values: [] },
  backdrops = [],
  save,
}) {
  const [name, N] = useState(initial.name),
    [values, V] = useState(initial.values),
    [query, Q] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save({ name: name.trim(), values });
      }}
    >
      <input
        required
        aria-label="Название пресета"
        placeholder="Название пресета"
        maxLength={80}
        value={name}
        onChange={(e) => N(e.target.value)}
      />
      <input
        aria-label="Поиск фона пресета"
        placeholder="Найти фон…"
        value={query}
        onChange={(e) => Q(e.target.value)}
      />
      <div className="chips">
        {values.map((v) => (
          <button
            type="button"
            className="selected"
            key={v}
            onClick={() => V(values.filter((x) => x !== v))}
          >
            <BackdropSwatch name={v} /> {v} ×
          </button>
        ))}
      </div>
      <div className="preset-options">
        {[...new Set([...backdrops, ...values])]
          .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
          .map((v) => (
            <label key={v}>
              <input
                type="checkbox"
                checked={values.includes(v)}
                onChange={() =>
                  V(
                    values.includes(v)
                      ? values.filter((x) => x !== v)
                      : [...values, v],
                  )
                }
              />
              <BackdropSwatch name={v} /> {v}
            </label>
          ))}
      </div>
      <button
        className="primary full"
        disabled={!name.trim() || !values.length}
      >
        Сохранить
      </button>
    </form>
  );
}
