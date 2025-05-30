// elokman-backend/routes/userRoutes.js
const express = require('express');
const { body, validationResult } = require('express-validator'); // express-validator'ı import et
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/users/profile - Giriş yapmış kullanıcının profil bilgilerini getir (KORUMALI)
router.get('/profile', protect, async (req, res) => {
  console.log('--- /api/users/profile GET isteği geldi (korumalı) ---');
  console.log('Doğrulanan kullanıcı (req.user):', req.user);

  if (!req.user || !req.user.userId) {
    return res.status(401).json({ errors: [{ message: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }] });
  }

  try {
    const userResult = await db.query(
      'SELECT id, username, email, full_name, phone_number, created_at, updated_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      console.log('Profil hatası: Kullanıcı veritabanında bulunamadı, ID:', req.user.userId);
      return res.status(404).json({ errors: [{ message: 'Kullanıcı bulunamadı.' }] });
    }

    console.log('Kullanıcı profili başarıyla bulundu ve gönderiliyor.');
    res.status(200).json(userResult.rows[0]);
  } catch (error) {
    console.error('Profil bilgileri alınırken sunucu hatası:', error);
    res.status(500).json({ errors: [{ message: 'Profil bilgileri alınırken bir sunucu hatası oluştu.' }] });
  }
});

// PUT /api/users/profile - Giriş yapmış kullanıcının profil bilgilerini güncelle (KORUMALI)
router.put(
  '/profile',
  protect, // Önce yetkilendirme middleware'i
  [ // Sonra doğrulama kuralları
    body('fullName')
      .optional() // Güncelleme için alanlar opsiyonel olabilir
      .trim()
      .isLength({ min: 2 }).withMessage('Tam ad en az 2 karakter olmalıdır.')
      .escape(),
    body('phoneNumber')
      .optional()
      .trim()
      .isMobilePhone('tr-TR').withMessage('Geçerli bir Türkiye cep telefonu numarası giriniz. (Örn: 5xxxxxxxxx)')
      // .matches(/^[0-9]{10}$/).withMessage('Telefon numarası 10 rakamdan oluşmalıdır.') // Alternatif
  ],
  async (req, res) => {
    console.log('--- /api/users/profile PUT isteği geldi (korumalı) ---');
    console.log('Doğrulanan kullanıcı (req.user):', req.user);
    console.log('Güncelleme için istek Body:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Profil güncelleme validasyon hataları:', errors.array());
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const { fullName, phoneNumber } = req.body;

    // Güncellenecek alanları ve değerlerini dinamik olarak oluştur
    const fieldsToUpdate = [];
    const values = [];
    let queryParamIndex = 1; // SQL sorgusundaki parametreler için ($1, $2, ...)

    // Sadece istekte gönderilen ve tanıdığımız alanları güncellemeye dahil et
    if (req.body.hasOwnProperty('fullName')) { // null veya boş string de güncelleme olarak kabul edilsin
      fieldsToUpdate.push(`full_name = $${queryParamIndex++}`);
      values.push(fullName); // fullName undefined ise null olarak gider (DB'de null olabilir)
    }
    if (req.body.hasOwnProperty('phoneNumber')) {
      fieldsToUpdate.push(`phone_number = $${queryParamIndex++}`);
      values.push(phoneNumber); // phoneNumber undefined ise null olarak gider
    }

    // Eğer güncellenecek hiçbir geçerli alan gönderilmediyse
    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ errors: [{ message: 'Güncellenecek geçerli bir alan (fullName, phoneNumber) göndermelisiniz.' }] });
    }

    // Sorguya kullanıcı ID'sini ekle (WHERE koşulu için)
    values.push(userId);

    const updateQuery = `
      UPDATE users
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${queryParamIndex} 
      RETURNING id, username, email, full_name, phone_number, created_at, updated_at;
    `;
    // Örn: UPDATE users SET full_name = $1, phone_number = $2, updated_at = ... WHERE id = $3

    try {
      console.log('UPDATE Sorgusu:', updateQuery);
      console.log('UPDATE Değerleri:', values);
      const result = await db.query(updateQuery, values);

      if (result.rows.length === 0) {
        // Bu durum, protect middleware'i kullanıcıyı doğrulamasına rağmen,
        // bir şekilde o ID'ye sahip kullanıcının veritabanında olmaması (çok nadir)
        // veya WHERE id = $X AND user_id = $Y gibi bir koşulda user_id uyuşmazlığı (burada user_id'yi WHERE'de kullanmadık, direkt id ile güncelledik)
        // bizim senaryomuzda WHERE id = $X koşulu var ve bu id token'dan geliyor.
        console.log('Profil güncelleme hatası: Kullanıcı bulunamadı, ID:', userId);
        return res.status(404).json({ errors: [{ message: 'Güncellenecek kullanıcı bulunamadı.' }] });
      }

      console.log('Kullanıcı profili başarıyla güncellendi:', result.rows[0]);
      res.status(200).json({
        message: 'Profil başarıyla güncellendi.',
        user: result.rows[0] // Güncellenmiş kullanıcı bilgilerini döndür
      });
    } catch (error) {
      console.error('Profil güncellenirken sunucu hatası:', error);
      res.status(500).json({ errors: [{ message: 'Profil güncellenirken bir sunucu hatası oluştu.' }] });
    }
  }
);

// GET /api/users/health-summary - Kullanıcının tüm sağlık verilerini getir (AI için)
router.get('/health-summary', protect, async (req, res) => {
  console.log('--- /api/users/health-summary GET isteği geldi (korumalı) ---');
  console.log('Doğrulanan kullanıcı (req.user):', req.user);

  if (!req.user || !req.user.userId) {
    return res.status(401).json({ errors: [{ message: 'Yetkilendirme hatası: Kullanıcı kimliği bulunamadı.' }] });
  }

  try {
    const userId = req.user.userId;

    // Kullanıcının temel bilgilerini al
    const userResult = await db.query(
      'SELECT id, username, email, full_name, phone_number, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ errors: [{ message: 'Kullanıcı bulunamadı.' }] });
    }

    const user = userResult.rows[0];

    // TODO: Gerçek veriler için aşağıdaki sorguları kullanıcının ID'sine göre filtrelemelisiniz
    // Şimdilik boş diziler döndürüyoruz çünkü ilgili tablolar henüz mevcut değil

    // İlaçları al (medications tablosu varsa)
    let medications = [];
    try {
      // const medicationsResult = await db.query('SELECT * FROM medications WHERE user_id = $1', [userId]);
      // medications = medicationsResult.rows;
    } catch (err) {
      console.log('İlaçlar tablosu bulunamadı veya hata:', err.message);
    }

    // Randevuları al (appointments tablosu varsa)
    let appointments = [];
    try {
      // const appointmentsResult = await db.query('SELECT * FROM appointments WHERE user_id = $1', [userId]);
      // appointments = appointmentsResult.rows;
    } catch (err) {
      console.log('Randevular tablosu bulunamadı veya hata:', err.message);
    }

    // Raporları al (reports tablosu varsa)
    let reports = [];
    try {
      // const reportsResult = await db.query('SELECT * FROM reports WHERE user_id = $1', [userId]);
      // reports = reportsResult.rows;
    } catch (err) {
      console.log('Raporlar tablosu bulunamadı veya hata:', err.message);
    }

    // Sağlık geçmişini al (health_history tablosu varsa)
    let healthHistory = [];
    try {
      // const healthHistoryResult = await db.query('SELECT * FROM health_history WHERE user_id = $1', [userId]);
      // healthHistory = healthHistoryResult.rows;
    } catch (err) {
      console.log('Sağlık geçmişi tablosu bulunamadı veya hata:', err.message);
    }

    const healthSummary = {
      user: {
        id: user.id,
        name: user.full_name || user.username,
        email: user.email,
        phoneNumber: user.phone_number,
        memberSince: user.created_at
      },
      medications: medications,
      appointments: appointments,
      reports: reports,
      healthHistory: healthHistory
    };

    console.log('Kullanıcı sağlık özeti başarıyla hazırlandı');
    res.status(200).json(healthSummary);

  } catch (error) {
    console.error('Sağlık özeti alınırken sunucu hatası:', error);
    res.status(500).json({ errors: [{ message: 'Sağlık özeti alınırken bir sunucu hatası oluştu.' }] });
  }
});

module.exports = router;