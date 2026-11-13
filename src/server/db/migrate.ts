import { getDb, ensureDemoSeed } from './database.ts';

const db = getDb();
ensureDemoSeed();
const migrations = db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all();
console.log('Applied migrations:', migrations);
