import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, "..", "data.sqlite");

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS polls (id TEXT PRIMARY KEY, question TEXT NOT NULL, created_at INTEGER NOT NULL)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS options (id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, text TEXT NOT NULL, FOREIGN KEY(poll_id) REFERENCES polls(id))"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS votes (id INTEGER PRIMARY KEY AUTOINCREMENT, poll_id TEXT NOT NULL, option_id TEXT NOT NULL, voter_cookie TEXT, voter_hash TEXT, created_at INTEGER NOT NULL, FOREIGN KEY(poll_id) REFERENCES polls(id), FOREIGN KEY(option_id) REFERENCES options(id))"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes(poll_id)"
  );
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(poll_id, voter_cookie, voter_hash)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, text TEXT NOT NULL, FOREIGN KEY(poll_id) REFERENCES polls(id))"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS q_options (id TEXT PRIMARY KEY, question_id TEXT NOT NULL, text TEXT NOT NULL, FOREIGN KEY(question_id) REFERENCES questions(id))"
  );
  db.run(
    "ALTER TABLE votes ADD COLUMN question_id TEXT"
  , () => {});
  db.run(
    "ALTER TABLE polls ADD COLUMN allow_multiple_votes INTEGER"
  , () => {});
  db.run(
    "ALTER TABLE polls ADD COLUMN max_votes_per_question INTEGER"
  , () => {});
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_votes_question ON votes(question_id)"
  );
});

export default db;
