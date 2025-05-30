// elokman-backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
// require('dotenv').config(); // Bu satıra burada gerek yok, çünkü JWT_SECRET server.js veya route'u çağıran yerden process.env üzerinden zaten erişilebilir olmalı.
                           // Eğer direkt burada process.env.JWT_SECRET kullanacaksanız ve bu dosya tek başına test ediliyorsa gerekebilir.
                           // Ancak Express uygulamasında ana dosyada (server.js) dotenv.config() çağrılması yeterlidir.

const protect = (req, res, next) => {
  let token;

  // Token'ı 'Authorization' başlığından 'Bearer <token>' formatında al
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1]; // 'Bearer ' kısmını atla, sadece token'ı al

      // Token'ı doğrula
      const decoded = jwt.verify(token, process.env.JWT_SECRET); // JWT_SECRET'ı .env'den alır

      // Doğrulanmış kullanıcı bilgilerini (payload) req objesine ekle,
      // böylece sonraki route handler'ları bu bilgilere erişebilir.
      // Login sırasında payload'a { userId: user.id, username: user.username } koymuştuk.
      req.user = decoded; // req.user şimdi { userId: ..., username: ... } içerecek

      next(); // Her şey yolundaysa, sonraki middleware'e veya route handler'a geç
    } catch (error) {
      console.error('Token doğrulama hatası:', error.message);
      // Token geçerli değilse (süresi dolmuş, yanlış imza vb.)
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Yetkisiz erişim: Geçersiz token.' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Yetkisiz erişim: Token süresi dolmuş.' });
      }
      // Diğer beklenmedik JWT hataları
      return res.status(401).json({ message: 'Yetkisiz erişim: Token doğrulanamadı.' });
    }
  }

  if (!token) {
    // Eğer 'Authorization' başlığı yoksa veya 'Bearer' ile başlamıyorsa token bulunamamıştır.
    res.status(401).json({ message: 'Yetkisiz erişim: Token bulunamadı veya formatı yanlış.' });
  }
};

module.exports = { protect };