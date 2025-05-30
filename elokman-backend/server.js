// elokman-backend/server.js
const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');
const authRoutes = require('./routes/authRoutes.js'); // Bu satırı ekleyin veya yorumunu kaldırın
const aiRoutes = require('./routes/aiRoutes.js');   // Bu satırı ekleyin veya yorumunu kaldırın
const userRoutes = require('./routes/userRoutes.js');
const medicationRoutes = require('./routes/medicationRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const healthHistoryRoutes = require('./routes/healthHistoryRoutes');
const logger = require('./config/logger');
const app = express();
const PORT = process.env.PORT || 3001;
const morgan = require('morgan');


// Middleware'ler
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        process.env.FRONTEND_URL
    ].filter(Boolean), // process.env.FRONTEND_URL yoksa filtrele
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes); 
app.use('/api/ai', aiRoutes);   
app.use('/api/users', userRoutes);
app.use('/api/medications', medicationRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/health-history', healthHistoryRoutes);
app.get('/', (req, res) => {
  res.status(200).send('E-Lokman Backend Servisi Çalışıyor!');
});

// Morgan'ı logger.stream ile kullan (HTTP logları hem konsola hem de dosyaya gider)
// 'combined' formatı detaylıdır, 'dev' daha kısa ve renklidir.
// Geliştirme için 'dev', üretim için 'combined' veya özel format kullanılabilir.
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Sadece konsola, renkli
} else {
  app.use(morgan('combined', { stream: logger.stream })); // Winston stream'ine yönlendir
}

// Genel Hata Yönetimi
app.use((err, req, res, next) => {
    let statusCode = err.status || 500;
    let message = err.message || 'Sunucuda beklenmedik bir hata oluştu.';
  // Hata detaylarını logla
  logger.error(`${statusCode} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip} - Stack: ${err.stack || 'No stack'}`);
    // PostgreSQL Hatalarını Ele Alma (Örnekler)
    if (err.code) { // PostgreSQL hataları genellikle bir 'code' özelliğine sahiptir
      console.error(`PostgreSQL Hatası - Kod: ${err.code}, Mesaj: ${err.message}, Detay: ${err.detail}, Stack: ${err.stack}`);
      switch (err.code) {
        case '23505': // unique_violation
          statusCode = 409; // Conflict
          // err.constraint'e bakarak hangi unique kısıtlamasının ihlal edildiğini anlayabiliriz
          // Örneğin, "users_email_key" ise "Bu e-posta adresi zaten kayıtlı." diyebiliriz.
          // Şimdilik genel bir mesaj verelim.
          message = 'Girilen bilgilerden bazıları (örn: e-posta, kullanıcı adı) sistemde zaten mevcut.';
          break;
        case '23503': // foreign_key_violation
          statusCode = 400; // Bad Request veya 409 Conflict
          message = 'İlişkili bir kayıt bulunamadığından işlem gerçekleştirilemedi.';
          break;
        case '22P02': // invalid_text_representation (örn: integer beklenen yere string)
          statusCode = 400;
          message = 'Geçersiz veri formatı. Lütfen girdiğiniz verileri kontrol edin.';
          break;
        // Diğer PostgreSQL hata kodları için https://www.postgresql.org/docs/current/errcodes-appendix.html
        default:
          // Bilinmeyen DB hatası, genel 500 mesajı kalsın.
          message = 'Veritabanı işlemi sırasında bir sorun oluştu.';
      }
    } else {
      // Diğer uygulama hataları
      console.error(`Uygulama Hatası - Durum: ${statusCode}, Mesaj: ${message}, Stack: ${err.stack || 'No stack available'}`);
    }
  
    // Geliştirme ortamında daha fazla detay göster
    const errorResponse = {
      error: {
        message: message,
      }
    };
  
    if (process.env.NODE_ENV === 'development' && err.stack) {
      errorResponse.error.stack = err.stack;
      if(err.code) errorResponse.error.db_code = err.code; // DB hata kodunu da ekle
      if(err.detail) errorResponse.error.db_detail = err.detail; // DB detayını da ekle
    }
  
    res.status(statusCode).json(errorResponse);
  });

  
  app.listen(PORT, () => {
    // console.log(`E-Lokman Backend sunucusu http://localhost:${PORT} adresinde başarıyla başlatıldı.`);
    logger.info(`E-Lokman Backend sunucusu http://localhost:${PORT} adresinde başarıyla başlatıldı. Ortam: ${process.env.NODE_ENV || 'development'}`);
  });
