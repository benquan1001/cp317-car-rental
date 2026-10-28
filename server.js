// Starts the web server: npm start
const fs = require('fs');
const { createApp } = require('./src/app');

fs.mkdirSync('data', { recursive: true });
const app = createApp({ dbFile: process.env.DB_FILE || 'data/car_rental.db' });
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Car Rental System running at http://localhost:${port}`));
