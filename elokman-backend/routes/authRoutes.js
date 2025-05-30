// elokman-backend/routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator'); // express-validator'dan gerekli fonksiyonları import et
const db = require('../db');
const router = express.Router();
const logger = require('../config/logger'); 


// POST /api/auth/register - Yeni Kullanıcı Kaydı
router.post(
  '/register',
  [
    // Doğrulama kuralları bir dizi içinde tanımlanır
    body('username')
      .trim()
      .notEmpty().withMessage('Kullanıcı adı boş bırakılamaz.')
      .isLength({ min: 4 }).withMessage('Kullanıcı adı en az 4 karakter olmalıdır.')
      .escape(), // HTML ve JS enjeksiyonlarına karşı koruma
    body('email')
      .trim()
      .notEmpty().withMessage('E-posta boş bırakılamaz.')
      .isEmail().withMessage('Geçerli bir e-posta adresi giriniz.')
      .normalizeEmail(), // E-postayı standart bir formata getirir (örn: küçük harf)
    body('password')
      .notEmpty().withMessage('Şifre boş bırakılamaz.')
      .isLength({ min: 8 }).withMessage('Şifre en az 8 karakter olmalıdır.'),
    body('fullName')
      .optional({ checkFalsy: true }) // Opsiyonel, ama verilirse boş olmamalı
      .trim()
      .isLength({ min: 3 }).withMessage('Tam ad en az 3 karakter olmalıdır.')
      .escape(),
    body('phoneNumber')
      .optional({ checkFalsy: true })
      .trim()
      .isMobilePhone('tr-TR').withMessage('Geçerli bir Türkiye cep telefonu numarası giriniz. (Örn: 5xxxxxxxxx)') // 'tr-TR' lokalizasyonu
      // .matches(/^[0-9]{10}$/).withMessage('Telefon numarası 10 rakamdan oluşmalıdır.') // Alternatif regex
  ],
  async (req, res) => {
    console.log('--- /api/auth/register endpointine istek geldi ---');
    console.log('İstek Body:', req.body);

    // Doğrulama sonuçlarını kontrol et
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Kayıt validasyon hataları:', errors.array());
      // Hataları kullanıcıya daha anlaşılır bir formatta döndür
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const { username, email, password, fullName, phoneNumber } = req.body;

    try {
      console.log('Mevcut kullanıcı kontrol ediliyor...');
      const existingUser = await db.query(
        'SELECT * FROM users WHERE username = $1 OR email = $2',
        [username, email]
      );

      if (existingUser.rows.length > 0) {
        console.log('Kayıt hatası: Kullanıcı adı veya e-posta zaten kullanımda.');
        return res.status(409).json({ errors: [{ message: 'Bu kullanıcı adı veya e-posta zaten kullanımda.' }] });
      }

      console.log('Şifre hashleniyor...');
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      console.log('Yeni kullanıcı veritabanına ekleniyor...');
      const newUserQuery = `
        INSERT INTO users (username, email, password_hash, full_name, phone_number)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, username, email, full_name, phone_number, created_at;
      `;
      const newUserValues = [username, email, passwordHash, fullName || null, phoneNumber || null];
      const newUserResult = await db.query(newUserQuery, newUserValues);
      const newUser = newUserResult.rows[0];
      console.log('Yeni kullanıcı başarıyla eklendi, ID:', newUser.id);

      console.log('--- /api/auth/register İSTEĞİ BAŞARIYLA BİTTİ ---');
      res.status(201).json({
        message: 'Kullanıcı başarıyla kaydedildi. Lütfen giriş yapınız.',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.full_name,
          phoneNumber: newUser.phone_number,
          createdAt: newUser.created_at,
        }
      });

    } catch (err) {
      console.error('Kayıt sırasında sunucu hatası DETAY:', err);
      res.status(500).json({ errors: [{ message: 'Sunucu hatası, kullanıcı kaydedilemedi.' }] });
    }
  }
);


// POST /api/auth/login - Kullanıcı Girişi
router.post(
  '/login',
  [
    body('email')
      .trim()
      .notEmpty().withMessage('E-posta boş bırakılamaz.')
      .isEmail().withMessage('Geçerli bir e-posta adresi giriniz.')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Şifre boş bırakılamaz.')
  ],
  async (req, res) => {
    console.log('--- /api/auth/login endpointine istek geldi ---');
    console.log('İstek Body:', req.body);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Login validasyon hataları:', errors.array());
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const { email, password } = req.body;

    try {
      console.log('Kullanıcı e-posta ile aranıyor:', email);
      const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);

      if (userResult.rows.length === 0) {
        console.log('Login hatası: Kullanıcı bulunamadı, e-posta:', email);
        return res.status(401).json({ errors: [{ message: 'Geçersiz e-posta veya şifre.' }] });
      }

      const user = userResult.rows[0];
      console.log('Kullanıcı bulundu, ID:', user.id, 'Şifre karşılaştırılıyor...');

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        console.log('Login hatası: Şifre eşleşmedi, kullanıcı ID:', user.id);
        return res.status(401).json({ errors: [{ message: 'Geçersiz e-posta veya şifre.' }] });
      }

      console.log('Şifre doğru. JWT oluşturuluyor, kullanıcı ID:', user.id);
      const payload = { userId: user.id, username: user.username };
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
      console.log('JWT başarıyla oluşturuldu.');

      console.log('--- /api/auth/login İSTEĞİ BAŞARIYLA BİTTİ ---');
      res.status(200).json({
        message: 'Giriş başarılı.',
        token: token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name
        }
      });

    } catch (err) {
      console.error('Giriş sırasında sunucu hatası DETAY:', err);
      res.status(500).json({ errors: [{ message: 'Giriş sırasında bir sunucu hatası oluştu.' }] });
    }
  }
);

module.exports = router;