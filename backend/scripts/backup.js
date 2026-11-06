const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

function createBackup({ sourceFile = process.env.PRECIONAUTA_DB || path.join(__dirname, '..', 'data', 'precionauta.db'), backupDir = path.join(path.dirname(sourceFile), 'backups') } = {}) {
  if (!fs.existsSync(sourceFile)) throw new Error('No existe la base de datos que se quiere respaldar');
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  const name = `precionauta-${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.db`;
  const file = path.resolve(backupDir, name);
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  try { source.prepare('VACUUM INTO ?').run(file); }
  finally { source.close(); }
  fs.chmodSync(file, 0o600);
  const snapshot = new DatabaseSync(file, { readOnly: true });
  try {
    if (snapshot.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('No se pudo verificar el respaldo');
  } finally { snapshot.close(); }
  return file;
}

if (require.main === module) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  try { console.log(`Respaldo verificado: ${createBackup()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { createBackup };
