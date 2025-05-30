// elokman-backend/config/logger.js
const winston = require('winston');
const path = require('path');

// Log seviyeleri: error, warn, info, http, verbose, debug, silly
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3, // HTTP istekleri için özel seviye
  debug: 4,
};

// Geliştirme ortamı için renkler
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};
winston.addColors(colors);

// Log formatı
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message} ${info.stack ? '\n' + info.stack : ''}`
  )
);

// Logları nereye yazacağımızı (transport) belirleyelim
const transports = [
  // Konsola yazdırma (geliştirme ortamı için renkli)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: true }), // Renklendirme
      logFormat
    ),
  }),
  // Hata loglarını ayrı bir dosyaya yazma
  new winston.transports.File({
    filename: path.join(__dirname, '..', 'logs', 'error.log'), // logs/error.log
    level: 'error', // Sadece error seviyesindeki loglar
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),
  // Tüm logları başka bir dosyaya yazma
  new winston.transports.File({
    filename: path.join(__dirname, '..', 'logs', 'all.log'), // logs/all.log
    format: logFormat,
    maxsize: 5242880,
    maxFiles: 5,
  }),
];

// Logger'ı oluştur
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn', // Geliştirme için debug, üretim için warn
  levels,
  transports,
  exitOnError: false, // Hata durumunda uygulamayı sonlandırma
});

// HTTP isteklerini loglamak için bir stream oluştur (morgan ile kullanılabilir)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

// logs klasörünü oluştur (eğer yoksa)
const logsDir = path.join(__dirname, '..', 'logs');
if (!require('fs').existsSync(logsDir)) {
  require('fs').mkdirSync(logsDir);
}

module.exports = logger;