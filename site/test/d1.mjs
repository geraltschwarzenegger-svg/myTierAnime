/**
 * Прослойка, изображающая интерфейс D1 поверх встроенного в Node SQLite.
 * Нужна, чтобы гонять Worker целиком без Cloudflare и без сети: D1 — это тот же
 * SQLite, отличается только обёртка prepare/bind/first/all/run.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }

  #prep() { return this.db.prepare(this.sql); }

  async first(col) {
    const row = this.#prep().get(...this.args);
    if (row === undefined) return null;
    const plain = { ...row };
    return col === undefined ? plain : plain[col];
  }
  async all() {
    const rows = this.#prep().all(...this.args).map(r => ({ ...r }));
    return { results: rows, success: true, meta: { rows_read: rows.length } };
  }
  async run() {
    const r = this.#prep().run(...this.args);
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export function makeD1(schemaPath) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return {
    prepare: sql => new Stmt(db, sql),
    async batch(stmts) { return Promise.all(stmts.map(s => s.run())); },
    async exec(sql) { db.exec(sql); return { count: 0, duration: 0 }; },
    _raw: db
  };
}
