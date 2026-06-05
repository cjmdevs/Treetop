const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function createDb() {
  if (process.env.NODE_ENV === 'test') {
    return new Database(':memory:');
  }
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return new Database(path.join(dataDir, 'treetop.db'));
}

const db = createDb();
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
