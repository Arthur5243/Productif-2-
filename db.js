import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DATA_DIR permet de pointer vers un volume Railway persistant (ex: /data).
// Sans volume monté, la base vit sur le disque éphémère du service et sera
// réinitialisée à chaque redéploiement.
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'productif.db'));
db.pragma('journal_mode = WAL');

// Pas de notion d'utilisateur : appli mono-utilisateur, aucune connexion requise.
db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    created_at TEXT NOT NULL
  );
`);

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function listActivities() {
  return db.prepare('SELECT id, title, date, time FROM activities ORDER BY date, time').all();
}

export function insertActivities(activities) {
  const insert = db.prepare(
    'INSERT INTO activities (id, title, date, time, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const now = new Date().toISOString();
  const inserted = [];

  const runAll = db.transaction((items) => {
    for (const a of items) {
      const id = genId();
      insert.run(id, a.title, a.date, a.time || null, now);
      inserted.push({ id, title: a.title, date: a.date, time: a.time || null });
    }
  });
  runAll(activities);

  return inserted;
}

export function deleteActivity(id) {
  const result = db.prepare('DELETE FROM activities WHERE id = ?').run(id);
  return result.changes > 0;
}
