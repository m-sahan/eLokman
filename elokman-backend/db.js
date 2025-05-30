// db.js
const { Pool } = require('pg');
require('dotenv').config(); // .env dosyasındaki değişkenleri yükler

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

pool.on('connect', () => {
  console.log('PostgreSQL veritabanına başarıyla bağlanıldı!');
});

pool.on('error', (err) => {
  console.error('PostgreSQL bağlantı havuzunda beklenmedik hata:', err);
  process.exit(-1); // Hata durumunda uygulamayı sonlandır
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // İleri düzey işlemler için pool'u da export edebiliriz
};