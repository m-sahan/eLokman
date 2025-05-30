// elokman-backend/routes/healthHistoryRoutes.js
const express = require('express');
const { body, validationResult, param , query} = require('express-validator');
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../config/logger');

const router = express.Router();

// GET /api/health-history - Tüm sağlık geçmişi kayıtlarını listele
router.get('/', protect, async (req, res) => {
  const userId = req.user.userId;
  console.log(`GET /api/health-history isteği geldi, kullanıcı ID: ${userId}`);
  try {
    const result = await db.query(
      'SELECT * FROM health_history WHERE user_id = $1 ORDER BY visit_date DESC',
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Sağlık geçmişi listelenirken hata:', error);
    res.status(500).json({ errors: [{ message: 'Sağlık geçmişi listelenirken bir sunucu hatası oluştu.' }]});
  }
});

// POST /api/health-history - Yeni sağlık geçmişi kaydı ekle
router.post(
  '/',
  protect,
  [
    body('visit_date').isISO8601().toDate().withMessage('Geçerli bir ziyaret tarihi giriniz (YYYY-MM-DD).'),
    body('hospital_name').trim().notEmpty().withMessage('Hastane adı boş bırakılamaz.').escape(),
    body('visit_type').trim().notEmpty().withMessage('Ziyaret türü boş bırakılamaz.').escape(),
    body('department').optional({ checkFalsy: true }).trim().escape(),
    body('doctor_name').optional({ checkFalsy: true }).trim().escape(),
    body('notes').optional({ checkFalsy: true }).trim().escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const { visit_date, hospital_name, department, doctor_name, visit_type, notes } = req.body;
    console.log(`POST /api/health-history isteği, kullanıcı ID: ${userId}, Body:`, req.body);

    try {
      const newHistoryQuery = `
        INSERT INTO health_history (user_id, visit_date, hospital_name, department, doctor_name, visit_type, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const newHistoryValues = [
        userId, visit_date, hospital_name, department || null,
        doctor_name || null, visit_type, notes || null
      ];
      const result = await db.query(newHistoryQuery, newHistoryValues);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Sağlık geçmişi kaydı eklenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Sağlık geçmişi kaydı eklenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// GET /api/health-history - Tüm sağlık geçmişi kayıtlarını listele (SAYFALAMALI)
router.get(
  '/',
  protect,
  [
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('Sayfa numarası pozitif bir tam sayı olmalıdır.'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit 1 ile 100 arasında bir tam sayı olmalıdır.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const offset = (page - 1) * limit;

    logger.info(`GET /api/health-history isteği. Kullanıcı ID: ${userId}, Sayfa: ${page}, Limit: ${limit}`);

    try {
      const totalResult = await db.query(
        'SELECT COUNT(*) FROM health_history WHERE user_id = $1',
        [userId]
      );
      const totalItems = parseInt(totalResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      const historyResult = await db.query(
        'SELECT * FROM health_history WHERE user_id = $1 ORDER BY visit_date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.status(200).json({
        data: historyResult.rows,
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
      logger.error(`Sağlık geçmişi listelenirken hata, Kullanıcı ID: ${userId} - ${error.message} - Stack: ${error.stack}`);
      res.status(500).json({ errors: [{ message: 'Sağlık geçmişi listelenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// GET /api/health-history/:id - Belirli bir sağlık geçmişi kaydını getir
router.get(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir sağlık geçmişi IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }
    // ... (GET /:id mantığı aynı) ...
    const userId = req.user.userId;
    const historyId = parseInt(req.params.id);
    try {
        const result = await db.query(
            'SELECT * FROM health_history WHERE id = $1 AND user_id = $2',
            [historyId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Sağlık geçmişi kaydı bulunamadı veya bu kullanıcıya ait değil.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`Sağlık geçmişi (ID: ${historyId}) getirilirken hata:`, error);
        res.status(500).json({ errors: [{ message: 'Sağlık geçmişi bilgileri getirilirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// PUT /api/health-history/:id - Belirli bir sağlık geçmişi kaydını güncelle
router.put(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir sağlık geçmişi IDsi giriniz.'),
    body('visit_date').optional().isISO8601().toDate().withMessage('Geçerli bir ziyaret tarihi giriniz (YYYY-MM-DD).'),
    body('hospital_name').optional().trim().notEmpty().withMessage('Hastane adı boş olamaz (eğer güncelleniyorsa).').escape(),
    body('visit_type').optional().trim().notEmpty().withMessage('Ziyaret türü boş olamaz (eğer güncelleniyorsa).').escape(),
    body('department').optional({ nullable: true, checkFalsy: true }).trim().escape(),
    body('doctor_name').optional({ nullable: true, checkFalsy: true }).trim().escape(),
    body('notes').optional({ nullable: true, checkFalsy: true }).trim().escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const historyId = parseInt(req.params.id);
    // ... (PUT mantığı aynı, medicationRoutes'a benzer) ...
    const { visit_date, hospital_name, department, doctor_name, visit_type, notes } = req.body;
    const fieldsToUpdate = [];
    const values = [];
    let queryParamIndex = 1;

    if (req.body.hasOwnProperty('visit_date')) { fieldsToUpdate.push(`visit_date = $${queryParamIndex++}`); values.push(visit_date); }
    if (req.body.hasOwnProperty('hospital_name')) { fieldsToUpdate.push(`hospital_name = $${queryParamIndex++}`); values.push(hospital_name); }
    if (req.body.hasOwnProperty('department')) { fieldsToUpdate.push(`department = $${queryParamIndex++}`); values.push(department); }
    if (req.body.hasOwnProperty('doctor_name')) { fieldsToUpdate.push(`doctor_name = $${queryParamIndex++}`); values.push(doctor_name); }
    if (req.body.hasOwnProperty('visit_type')) { fieldsToUpdate.push(`visit_type = $${queryParamIndex++}`); values.push(visit_type); }
    if (req.body.hasOwnProperty('notes')) { fieldsToUpdate.push(`notes = $${queryParamIndex++}`); values.push(notes); }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ errors: [{ message: 'Güncellenecek en az bir alan göndermelisiniz.' }]});
    }
    values.push(historyId);
    values.push(userId);

    const updateQuery = `
      UPDATE health_history
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${queryParamIndex++} AND user_id = $${queryParamIndex}
      RETURNING *;
    `;
    try {
      const result = await db.query(updateQuery, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Güncellenecek sağlık geçmişi kaydı bulunamadı veya bu kullanıcıya ait değil.' });
      }
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('Sağlık geçmişi kaydı güncellenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Sağlık geçmişi kaydı güncellenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// DELETE /api/health-history/:id - Belirli bir sağlık geçmişi kaydını sil
router.delete(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir sağlık geçmişi IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }
    // ... (DELETE mantığı aynı) ...
    const userId = req.user.userId;
    const historyId = parseInt(req.params.id);
    try {
        const deleteQuery = 'DELETE FROM health_history WHERE id = $1 AND user_id = $2 RETURNING id;';
        const result = await db.query(deleteQuery, [historyId, userId]);
        if (result.rowCount === 0) {
          return res.status(404).json({ message: 'Silinecek sağlık geçmişi kaydı bulunamadı veya bu kullanıcıya ait değil.' });
        }
        res.status(204).send();
      } catch (error) {
        console.error('Sağlık geçmişi kaydı silinirken hata:', error);
        res.status(500).json({ errors: [{ message: 'Sağlık geçmişi kaydı silinirken bir sunucu hatası oluştu.' }]});
      }
  }
);

module.exports = router;