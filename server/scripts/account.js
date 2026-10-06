// Accounts on a hosted installation. Run inside the app container (see deploy/README.md):
//   node scripts/account.js create-company --name "Bergs Åkeri AB" --orgnr 556677-8899 --email kontor@bergsakeri.se [--user "Anna Berg"]
//   node scripts/account.js add-user --company 2 --email anna@bergsakeri.se --user "Anna Berg"
//   node scripts/account.js list
// The generated password is printed once. Give it to the customer by phone; they change it under Inställningar.
import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { openDb, migrate } from '../db/index.js';
import { addUser, createCompany, listCompanies } from '../lib/accounts.js';

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    name: { type: 'string' }, orgnr: { type: 'string' }, email: { type: 'string' }, user: { type: 'string' },
    company: { type: 'string' },
  },
});

const config = loadConfig();
const db = openDb(config.dbFile);
migrate(db);

try {
  if (command === 'create-company') {
    const r = createCompany(db, { name: values.name, orgNr: values.orgnr ?? null, email: values.email, userName: values.user });
    console.log(`Created company ${r.companyId} "${values.name}".`);
    console.log(`Login: ${r.email}`);
    console.log(`Password: ${r.password}`);
    console.log(`Office: ${config.appUrl}`);
  } else if (command === 'add-user') {
    const r = addUser(db, { companyId: Number(values.company), email: values.email, userName: values.user });
    console.log(`Added ${r.email} to company ${values.company}.`);
    console.log(`Password: ${r.password}`);
  } else if (command === 'list') {
    console.table(listCompanies(db));
  } else {
    console.log('Usage: node scripts/account.js create-company|add-user|list [options] (see the top of this file)');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
