const fs = require('fs');
const path = require('path');

const fileName = process.argv[2];
if (!fileName) {
  console.error('Uso: node scripts/print-firebase-env.js <archivo-service-account.json>');
  process.exit(1);
}

const absolutePath = path.isAbsolute(fileName) ? fileName : path.join(process.cwd(), fileName);
if (!fs.existsSync(absolutePath)) {
  console.error(`No se encontro el archivo: ${absolutePath}`);
  process.exit(1);
}

const rawJson = fs.readFileSync(absolutePath, 'utf8');
const parsed = JSON.parse(rawJson);
process.stdout.write(JSON.stringify(parsed));
