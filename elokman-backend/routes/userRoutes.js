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

module.exports = router;