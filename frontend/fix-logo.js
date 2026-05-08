const fs = require('fs');
const b64 = fs.readFileSync('images/ci-dolphin-logo.png').toString('base64');
fs.writeFileSync('images/dolphin-logo-b64.js', "const DOLPHIN_LOGO = 'data:image/png;base64," + b64 + "';");
console.log('Done! File written.');
