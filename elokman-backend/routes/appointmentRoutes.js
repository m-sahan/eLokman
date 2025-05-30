// elokman-backend/routes/appointmentRoutes.js
const express = require('express');
const { body, validationResult, param, query } = require('express-validator');
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../config/logger');
const router = express.Router();

// GET /api/appointments - Giriş yapmış kullanıcının tüm randevularını listele
router.get('/', protect, async (req, res) => {
  const userId = req.user.userId;
  console.log(`GET /api/appointments isteği geldi, kullanıcı ID: ${userId}`);
  try {
    const result = await db.query(
      'SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_date ASC, appointment_time ASC',
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Randevular listelenirken hata:', error);
    res.status(500).json({ errors: [{ message: 'Randevular listelenirken bir sunucu hatası oluştu.' }]});
  }
});

// POST /api/appointments - Yeni randevu ekle
router.post(
  '/',
  protect,
  [
    body('hospital').trim().notEmpty().withMessage('Hastane adı boş bırakılamaz.').escape(),
    body('department').trim().notEmpty().withMessage('Bölüm adı boş bırakılamaz.').escape(),
    body('doctor').optional({ checkFalsy: true }).trim().escape(),
    body('appointment_date').isISO8601().toDate().withMessage('Geçerli bir randevu tarihi giriniz (YYYY-MM-DD).')
      .custom((value) => { // Geçmiş bir tarih olmaması için özel kontrol
        if (new Date(value) < new Date(new Date().toDateString())) { // Saat bilgisini atlayarak sadece gün karşılaştırması
          throw new Error('Randevu tarihi geçmiş bir tarih olamaz.');
        }
        return true;
      }),
    body('appointment_time').matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).withMessage('Geçerli bir saat formatı giriniz (HH:MM veya HH:MM:SS).'),
    body('status').optional({ checkFalsy: true }).isIn(['Onaylandı', 'Beklemede', 'İptal Edildi']).withMessage('Geçersiz randevu durumu.').escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const { hospital, department, doctor, appointment_date, appointment_time, status } = req.body;
    console.log(`POST /api/appointments isteği, kullanıcı ID: ${userId}, Body:`, req.body);

    try {
      const newAppointmentQuery = `
        INSERT INTO appointments (user_id, hospital, department, doctor, appointment_date, appointment_time, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const newAppointmentValues = [
        userId, hospital, department, doctor || null,
        appointment_date, appointment_time, status || 'Onaylandı'
      ];
      const result = await db.query(newAppointmentQuery, newAppointmentValues);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Randevu eklenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Randevu eklenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// GET /api/appointments/:id - Belirli bir randevuyu getir
router.get(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir randevu IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const appointmentId = parseInt(req.params.id);
    console.log(`GET /api/appointments/${appointmentId} isteği, kullanıcı ID: ${userId}`);
    try {
      const result = await db.query(
        'SELECT * FROM appointments WHERE id = $1 AND user_id = $2',
        [appointmentId, userId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Randevu bulunamadı veya bu kullanıcıya ait değil.' });
      }
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error(`Randevu (ID: ${appointmentId}) getirilirken hata:`, error);
      res.status(500).json({ errors: [{ message: 'Randevu bilgileri getirilirken bir sunucu hatası oluştu.' }]});
    }
  }
); 

// GET /api/appointments - Giriş yapmış kullanıcının tüm randevularını listele (SAYFALAMALI)
router.get(
  '/',
  protect,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { /* ... hata yönetimi ... */ }

    const userId = req.user.userId;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const offset = (page - 1) * limit;

    logger.info(`GET /api/appointments isteği. Kullanıcı ID: ${userId}, Sayfa: ${page}, Limit: ${limit}`);

    try {
      const totalResult = await db.query(
        'SELECT COUNT(*) FROM appointments WHERE user_id = $1',
        [userId]
      );
      const totalItems = parseInt(totalResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      const appointmentsResult = await db.query(
        'SELECT * FROM appointments WHERE user_id = $1 ORDER BY appointment_date ASC, appointment_time ASC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.status(200).json({
        data: appointmentsResult.rows,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalItems,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      });
    } catch (error) {
      logger.error(`Randevular listelenirken hata, Kullanıcı ID: ${userId} - ${error.message} - Stack: ${error.stack}`);
      res.status(500).json({ errors: [{ message: 'Randevular listelenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// PUT /api/appointments/:id - Belirli bir randevuyu güncelle
router.put(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir randevu IDsi giriniz.'),
    body('hospital').optional().trim().notEmpty().withMessage('Hastane adı boş olamaz (eğer güncelleniyorsa).').escape(),
    body('department').optional().trim().notEmpty().withMessage('Bölüm adı boş olamaz (eğer güncelleniyorsa).').escape(),
    body('doctor').optional({ nullable: true, checkFalsy: true }).trim().escape(), // null veya boş string olabilir
    body('appointment_date').optional().isISO8601().toDate().withMessage('Geçerli bir randevu tarihi giriniz (YYYY-MM-DD).')
      .custom((value, { req }) => {
        // Sadece randevu tarihi güncelleniyorsa ve geçmiş bir tarihse kontrol et
        // Eğer req.body'de appointment_time da varsa, birlikte değerlendirilmeli
        // Bu özel kontrolü daha da geliştirebiliriz. Şimdilik sadece tarih kontrolü.
        if (new Date(value) < new Date(new Date().toDateString())) {
          throw new Error('Randevu tarihi geçmiş bir tarih olamaz.');
        }
        return true;
      }),
    body('appointment_time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/).withMessage('Geçerli bir saat formatı giriniz (HH:MM veya HH:MM:SS).'),
    body('status').optional().isIn(['Onaylandı', 'Beklemede', 'İptal Edildi', 'Tamamlandı']).withMessage('Geçersiz randevu durumu.').escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const appointmentId = parseInt(req.params.id);
    const { hospital, department, doctor, appointment_date, appointment_time, status } = req.body;
    console.log(`PUT /api/appointments/${appointmentId} isteği, kullanıcı ID: ${userId}, Body:`, req.body);

    const fieldsToUpdate = [];
    const values = [];
    let queryParamIndex = 1;

    if (req.body.hasOwnProperty('hospital')) { fieldsToUpdate.push(`hospital = $${queryParamIndex++}`); values.push(hospital); }
    if (req.body.hasOwnProperty('department')) { fieldsToUpdate.push(`department = $${queryParamIndex++}`); values.push(department); }
    if (req.body.hasOwnProperty('doctor')) { fieldsToUpdate.push(`doctor = $${queryParamIndex++}`); values.push(doctor); } // doctor null olabilir
    if (req.body.hasOwnProperty('appointment_date')) { fieldsToUpdate.push(`appointment_date = $${queryParamIndex++}`); values.push(appointment_date); }
    if (req.body.hasOwnProperty('appointment_time')) { fieldsToUpdate.push(`appointment_time = $${queryParamIndex++}`); values.push(appointment_time); }
    if (req.body.hasOwnProperty('status')) { fieldsToUpdate.push(`status = $${queryParamIndex++}`); values.push(status); }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ errors: [{ message: 'Güncellenecek en az bir alan göndermelisiniz.' }]});
    }
    values.push(appointmentId);
    values.push(userId);

    const updateQuery = `
      UPDATE appointments
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${queryParamIndex++} AND user_id = $${queryParamIndex}
      RETURNING *;
    `;
    try {
      const result = await db.query(updateQuery, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Güncellenecek randevu bulunamadı veya bu kullanıcıya ait değil.' });
      }
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('Randevu güncellenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Randevu güncellenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// DELETE /api/appointments/:id - Belirli bir randevuyu sil
router.delete(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir randevu IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const appointmentId = parseInt(req.params.id);
    console.log(`DELETE /api/appointments/${appointmentId} isteği, kullanıcı ID: ${userId}`);
    try {
      const deleteQuery = 'DELETE FROM appointments WHERE id = $1 AND user_id = $2 RETURNING id;';
      const result = await db.query(deleteQuery, [appointmentId, userId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Silinecek randevu bulunamadı veya bu kullanıcıya ait değil.' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Randevu silinirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Randevu silinirken bir sunucu hatası oluştu.' }]});
    }
  }
);

module.exports = router;