const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createBackup } = require('../backend/scripts/backup');

test('a live WAL database can be backed up consistently without changing the source', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'precionauta-backup-'));
  const sourceFile = path.join(dir, 'live.db');
  const source = new DatabaseSync(sourceFile);
  source.exec("PRAGMA journal_mode=WAL; CREATE TABLE prices(price INTEGER); INSERT INTO prices VALUES(1000),(1500),(900)");
  const file = createBackup({ sourceFile });
  const snapshot = new DatabaseSync(file, { readOnly: true });
  assert.deepEqual(snapshot.prepare('SELECT price FROM prices ORDER BY rowid').all().map(row => row.price), [1000, 1500, 900]);
  source.exec('INSERT INTO prices VALUES(800)');
  assert.equal(snapshot.prepare('SELECT COUNT(*) AS n FROM prices').get().n, 3);
  assert.equal(source.prepare('SELECT COUNT(*) AS n FROM prices').get().n, 4);
  assert.notEqual(file, sourceFile);
  assert.throws(() => createBackup({ sourceFile: path.join(dir, 'missing.db') }), /No existe/);
  t.after(() => { snapshot.close(); source.close(); fs.rmSync(dir, { recursive: true, force: true }); });
});
