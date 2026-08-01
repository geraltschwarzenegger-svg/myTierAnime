-- Схема базы тир-листа (Cloudflare D1 — это SQLite).
-- Применяется командой:
--   npx wrangler d1 execute anime-tierlist --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,       -- всегда в нижнем регистре
  slug        TEXT    NOT NULL UNIQUE,       -- адрес страницы: /geralt
  title       TEXT    NOT NULL DEFAULT '',   -- подпись списка
  notify      INTEGER NOT NULL DEFAULT 1,    -- слать ли письма об отзывах
  created_at  TEXT    NOT NULL,
  seen_at     TEXT    NOT NULL
);

-- Список пользователя хранится целиком как JSON: структура тиров живёт во
-- фронтенде и меняется вместе с ним, разбирать её на таблицы смысла нет.
CREATE TABLE IF NOT EXISTS lists (
  user_id   INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data      TEXT    NOT NULL,
  items     INTEGER NOT NULL DEFAULT 0,      -- денормализация для каталога
  saved_at  TEXT    NOT NULL,                -- метка из самого списка
  updated_at TEXT   NOT NULL                 -- когда записали на сервер
);

-- Одноразовые коды входа. Хранится не код, а его HMAC — из базы код не достать.
CREATE TABLE IF NOT EXISTS login_codes (
  email      TEXT    PRIMARY KEY,
  code_hash  TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,               -- unix ms
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_email TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  seen       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS feedback_owner ON feedback(owner_id, created_at DESC);

-- Универсальный счётчик частоты: ключ вида "login:почта" или "fb:адрес".
CREATE TABLE IF NOT EXISTS rate_limit (
  key      TEXT    PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL                  -- unix ms
);
