// npm run setup: create data dir + tables (just require db).
require('../src/db');
console.log('Setup done. Database ready at data/app.db');
console.log('Next: copy .env.example to .env, fill Google keys, then npm start');
