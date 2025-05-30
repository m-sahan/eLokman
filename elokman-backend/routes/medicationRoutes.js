// elokman-backend/routes/medicationRoutes.js
const express = require('express');
const { body, validationResult, param , query} = require('express-validator'); // param'ı da ekledik
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../config/logger');

const router = express.Router();

// ... (GET / endpoint'i aynı kalabilir) ...
router.get('/', protect, async (req, res) => {
    // ...
});

// POST /api/medications - Yeni ilaç ekle
router.post(
  '/',
  protect,
  [ // Doğrulama kuralları
    body('name').trim().notEmpty().withMessage('İlaç adı boş bırakılamaz.').isLength({ min: 2 }).withMessage('İlaç adı en az 2 karakter olmalıdır.').escape(),
    body('dose').trim().notEmpty().withMessage('Doz bilgisi boş bırakılamaz.').escape(),
    body('schedules').optional({ checkFalsy: true }).isArray().withMessage('Kullanım zamanları bir dizi olmalıdır.'),
    // schedules içindeki objeleri de doğrulamak için custom validator veya nested validation kullanılabilir, şimdilik dizi kontrolü yeterli.
    body('schedules.*.period').optional().isIn(['sabah', 'ogle', 'aksam', 'gece']).withMessage('Geçersiz kullanım periyodu. (sabah, ogle, aksam, gece)'),
    body('schedules.*.time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Geçersiz saat formatı. (HH:MM)') // HH:MM formatı
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const { name, dose, schedules } = req.body;
    // ... (geri kalan POST mantığı aynı, JSON.stringify(schedules) kullanmaya devam edin) ...
    try {
        const newMedicationQuery = `
          INSERT INTO medications (user_id, name, dose, schedules)
          VALUES ($1, $2, $3, $4)
          RETURNING *;
        `;
        const schedulesJsonString = schedules ? JSON.stringify(schedules) : null;
        const newMedicationValues = [userId, name, dose, schedulesJsonString];
        const result = await db.query(newMedicationQuery, newMedicationValues);
        res.status(201).json(result.rows[0]);
      } catch (error) {
        console.error('İlaç eklenirken hata:', error);
        res.status(500).json({ errors: [{ message: 'İlaç eklenirken bir sunucu hatası oluştu.' }]});
      }
  }
);

// GET /api/medications - Giriş yapmış kullanıcının tüm ilaçlarını listele (SAYFALAMALI)
router.get(
  '/',
  protect,
  [ // Query parametreleri için doğrulama
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
    // Query parametrelerinden sayfa ve limit değerlerini al, varsayılan değerler ata
    const page = req.query.page || 1;
    const limit = req.query.limit || 10; // Varsayılan olarak sayfa başına 10 kayıt
    const offset = (page - 1) * limit;

    logger.info(`GET /api/medications isteği. Kullanıcı ID: ${userId}, Sayfa: ${page}, Limit: ${limit}`);

    try {
      // Önce toplam kayıt sayısını alalım (sayfalama meta verisi için)
      const totalResult = await db.query(
        'SELECT COUNT(*) FROM medications WHERE user_id = $1',
        [userId]
      );
      const totalItems = parseInt(totalResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      // Sonra belirli bir sayfa için ilaçları alalım
      const medicationsResult = await db.query(
        'SELECT * FROM medications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.status(200).json({
        data: medicationsResult.rows, // Asıl veri
        pagination: { // Sayfalama meta verileri
          currentPage: page,
          totalPages: totalPages,
          totalItems: totalItems,
          itemsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1
        }
      });
    } catch (error) {
      logger.error(`İlaçlar listelenirken hata, Kullanıcı ID: ${userId} - ${error.message} - Stack: ${error.stack}`);
      res.status(500).json({ errors: [{ message: 'İlaçlar listelenirken bir sunucu hatası oluştu.' }] });
    }
  }
);

// GET /api/medications/:id - Belirli bir ilacı getir
router.get(
  '/:id',
  protect,
  [ // ID için doğrulama
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir ilaç IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }
    // ... (GET /:id mantığı aynı) ...
    const userId = req.user.userId;
    const medicationId = parseInt(req.params.id); // param('id').isInt() zaten sayıya çevirir ama parseInt de kalabilir.
    try {
        const result = await db.query(
            'SELECT * FROM medications WHERE id = $1 AND user_id = $2',
            [medicationId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'İlaç bulunamadı veya bu kullanıcıya ait değil.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`İlaç (ID: ${medicationId}) getirilirken hata:`, error);
        res.status(500).json({ message: 'İlaç bilgileri getirilirken bir sunucu hatası oluştu.' });
    }
});


// PUT /api/medications/:id - Belirli bir ilacı güncelle
router.put(
  '/:id',
  protect,
  [ // Doğrulama kuralları
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir ilaç IDsi giriniz.'), // URL parametresi için param()
    body('name').optional().trim().notEmpty().withMessage('İlaç adı boş olamaz (eğer güncelleniyorsa).').isLength({ min: 2 }).withMessage('İlaç adı en az 2 karakter olmalıdır.').escape(),
    body('dose').optional().trim().notEmpty().withMessage('Doz bilgisi boş olamaz (eğer güncelleniyorsa).').escape(),
    body('schedules').optional({ checkFalsy: true }).isArray().withMessage('Kullanım zamanları bir dizi olmalıdır.'),
    body('schedules.*.period').optional().isIn(['sabah', 'ogle', 'aksam', 'gece']).withMessage('Geçersiz kullanım periyodu.'),
    body('schedules.*.time').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Geçersiz saat formatı. (HH:MM)')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const medicationId = parseInt(req.params.id);
    // ... (geri kalan PUT mantığı aynı, JSON.stringify(schedules) kullanmaya devam edin) ...
    const { name, dose, schedules } = req.body;
    const fieldsToUpdate = [];
    const values = [];
    let queryParamIndex = 1;

    if (req.body.hasOwnProperty('name')) { fieldsToUpdate.push(`name = $${queryParamIndex++}`); values.push(name); }
    if (req.body.hasOwnProperty('dose')) { fieldsToUpdate.push(`dose = $${queryParamIndex++}`); values.push(dose); }
    if (req.body.hasOwnProperty('schedules')) { fieldsToUpdate.push(`schedules = $${queryParamIndex++}`); values.push(schedules ? JSON.stringify(schedules) : null); }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ errors: [{ message: 'Güncellenecek en az bir alan göndermelisiniz.' }]});
    }
    values.push(medicationId);
    values.push(userId);
    const updateQuery = `
      UPDATE medications
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${queryParamIndex++} AND user_id = $${queryParamIndex}
      RETURNING *;
    `;
    try {
      const result = await db.query(updateQuery, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Güncellenecek ilaç bulunamadı veya bu kullanıcıya ait değil.' });
      }
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('İlaç güncellenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'İlaç güncellenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// DELETE /api/medications/:id - Belirli bir ilacı sil
router.delete(
  '/:id',
  protect,
  [ // ID için doğrulama
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir ilaç IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }
    // ... (DELETE mantığı aynı) ...
    const userId = req.user.userId;
    const medicationId = parseInt(req.params.id);
    try {
        const deleteQuery = `DELETE FROM medications WHERE id = $1 AND user_id = $2 RETURNING *;`;
        const result = await db.query(deleteQuery, [medicationId, userId]);
        if (result.rowCount === 0) {
          return res.status(404).json({ message: 'Silinecek ilaç bulunamadı veya bu kullanıcıya ait değil.' });
        }
        res.status(204).send();
      } catch (error) {
        console.error('İlaç silinirken hata:', error);
        res.status(500).json({ errors: [{ message: 'İlaç silinirken bir sunucu hatası oluştu.' }]});
      }
  }
);

module.exports = router;