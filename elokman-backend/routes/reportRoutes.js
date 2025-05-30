// elokman-backend/routes/reportRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult , param , query} = require('express-validator'); // express-validator'ı ekle
const db = require('../db');
const { protect } = require('../middleware/authMiddleware');
const logger = require('../config/logger');

const router = express.Router();

// ... (Multer storage ve fileFilter kodları aynı kalacak) ...
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (mimetype && extname) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Dosya tipi desteklenmiyor! Sadece JPEG, PNG veya PDF yükleyebilirsiniz.';
    cb(null, false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 1024 * 1024 * 5 },
  fileFilter: fileFilter
}); // .single('reportFile')'ı route içinde kullanacağız


// POST /api/reports - Yeni bir rapor yükle
router.post(
  '/',
  protect,
  (req, res, next) => { // Multer'ı middleware zincirine bu şekilde ekleyelim
    upload.single('reportFile')(req, res, (err) => {
      if (req.fileValidationError) {
        return res.status(400).json({ errors: [{ message: req.fileValidationError }] });
      }
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ errors: [{ message: 'Dosya boyutu çok büyük! Maksimum 5MB.' }] });
        }
        return res.status(400).json({ errors: [{ message: `Dosya yükleme hatası: ${err.message}` }] });
      } else if (err) {
        console.error("Dosya yükleme sırasında genel hata (POST /api/reports):", err);
        return res.status(500).json({ errors: [{ message: 'Dosya yüklenirken beklenmedik bir hata oluştu.' }] });
      }
      // Dosya yükleme başarılı (veya dosya gönderilmedi), doğrulama ve DB işlemine devam et
      next();
    });
  },
  [ // express-validator kuralları
    body('type').trim().notEmpty().withMessage('Rapor türü boş bırakılamaz.').escape(),
    body('report_date').isISO8601().toDate().withMessage('Geçerli bir rapor tarihi giriniz (YYYY-MM-DD).'),
    body('doctor_name').optional().trim().escape(),
    body('status').optional().trim().escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Validasyon hatası varsa ve dosya yüklendiyse, dosyayı sil
      if (req.file) {
        fs.unlink(req.file.path, (errUnlink) => {
          if (errUnlink) console.error("Validasyon hatası sonrası dosya silinirken hata:", errUnlink);
        });
      }
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const { type, doctor_name, report_date, status } = req.body;
    console.log(`POST /api/reports isteği, kullanıcı ID: ${userId}, Body:`, req.body);
    if(req.file) console.log('Yüklenen dosya:', req.file);

    let fileName = req.file ? req.file.filename : null;
    let filePath = req.file ? `/uploads/${fileName}` : null;

    try {
      const newReportQuery = `
        INSERT INTO reports (user_id, type, doctor_name, report_date, status, file_name, file_path)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      const newReportValues = [userId, type, doctor_name || null, report_date, status || 'Belirtilmemiş', fileName, filePath];
      const result = await db.query(newReportQuery, newReportValues);

      console.log('Yeni rapor başarıyla eklendi:', result.rows[0]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Rapor DB\'ye eklenirken hata:', error);
      if (req.file) {
        fs.unlink(req.file.path, (errUnlink) => {
          if (errUnlink) console.error("DB hatası sonrası dosya silinirken hata:", errUnlink);
        });
      }
      res.status(500).json({ errors: [{ message: 'Rapor veritabanına kaydedilirken bir sunucu hatası oluştu.' }] });
    }
  }
);

// GET /api/reports - Giriş yapmış kullanıcının tüm raporlarını listele
router.get('/', protect, async (req, res) => {
  // ... (Bu endpoint aynı kalabilir) ...
  const userId = req.user.userId;
  console.log(`GET /api/reports isteği, kullanıcı ID: ${userId}`);
  try {
    const result = await db.query(
      'SELECT id, user_id, type, doctor_name, report_date, status, file_name FROM reports WHERE user_id = $1 ORDER BY report_date DESC',
      [userId]
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Raporlar listelenirken hata:', error);
    res.status(500).json({ message: 'Raporlar listelenirken bir sunucu hatası oluştu.' });
  }
});


// YENİ: GET /api/reports/:id/download - Belirli bir rapor dosyasını ID ile indir/görüntüle
// GET /api/reports - Giriş yapmış kullanıcının tüm raporlarını listele (SAYFALAMALI)
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

    logger.info(`GET /api/reports isteği. Kullanıcı ID: ${userId}, Sayfa: ${page}, Limit: ${limit}`);

    try {
      const totalResult = await db.query(
        'SELECT COUNT(*) FROM reports WHERE user_id = $1',
        [userId]
      );
      const totalItems = parseInt(totalResult.rows[0].count);
      const totalPages = Math.ceil(totalItems / limit);

      const reportsResult = await db.query(
        'SELECT id, user_id, type, doctor_name, report_date, status, file_name FROM reports WHERE user_id = $1 ORDER BY report_date DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.status(200).json({
        data: reportsResult.rows,
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
      logger.error(`Raporlar listelenirken hata, Kullanıcı ID: ${userId} - ${error.message} - Stack: ${error.stack}`);
      res.status(500).json({ errors: [{ message: 'Raporlar listelenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// GET /api/reports/:id - Belirli bir raporun meta verilerini getir
router.get(
  '/:id',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir rapor IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const reportId = parseInt(req.params.id);
    console.log(`GET /api/reports/${reportId} isteği, kullanıcı ID: ${userId}`);
    try {
        const result = await db.query(
            'SELECT id, user_id, type, doctor_name, report_date, status, file_name, file_path FROM reports WHERE id = $1 AND user_id = $2',
            [reportId, userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Rapor bulunamadı veya bu kullanıcıya ait değil.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error(`Rapor (ID: ${reportId}) meta verileri getirilirken hata:`, error);
        res.status(500).json({ errors: [{ message: 'Rapor meta verileri getirilirken bir sunucu hatası oluştu.' }]});
    }
});

// GET /api/reports/:id/download - Belirli bir rapor dosyasını indir/görüntüle
router.get(
  '/:id/download',
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir rapor IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const reportId = parseInt(req.params.id);
    console.log(`GET /api/reports/${reportId}/download isteği, kullanıcı ID: ${userId}`);

    try {
      // Önce rapor kullanıcıya ait mi ve dosya var mı kontrol et
      const result = await db.query(
        'SELECT file_name, file_path FROM reports WHERE id = $1 AND user_id = $2',
        [reportId, userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Rapor bulunamadı veya bu kullanıcıya ait değil.' });
      }

      const report = result.rows[0];
      if (!report.file_path || !report.file_name) {
        return res.status(404).json({ message: 'Bu rapor için dosya bulunamadı.' });
      }

      // Dosya yolunu oluştur ve var olup olmadığını kontrol et
      const absoluteFilePath = path.join(__dirname, '..', report.file_path);
      
      if (!fs.existsSync(absoluteFilePath)) {
        console.error(`Rapor dosyası bulunamadı: ${absoluteFilePath}`);
        return res.status(404).json({ message: 'Rapor dosyası sistemde bulunamadı.' });
      }

      // Dosya tipini belirle
      const fileExtension = path.extname(report.file_name).toLowerCase();
      let contentType = 'application/octet-stream'; // Varsayılan

      switch (fileExtension) {
        case '.pdf':
          contentType = 'application/pdf';
          break;
        case '.jpg':
        case '.jpeg':
          contentType = 'image/jpeg';
          break;
        case '.png':
          contentType = 'image/png';
          break;
      }

      // Güvenli dosya adı oluştur (Türkçe karakterleri İngilizce'ye çevir)
      const safeFileName = report.file_name
        .replace(/ç/g, 'c').replace(/Ç/g, 'C')
        .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
        .replace(/ı/g, 'i').replace(/I/g, 'I')
        .replace(/ö/g, 'o').replace(/Ö/g, 'O')
        .replace(/ş/g, 's').replace(/Ş/g, 'S')
        .replace(/ü/g, 'u').replace(/Ü/g, 'U');

      // Response header'larını ayarla
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
      
      // Dosyayı gönder
      res.sendFile(absoluteFilePath, (err) => {
        if (err) {
          console.error('Dosya gönderilirken hata:', err);
          if (!res.headersSent) {
            res.status(500).json({ message: 'Dosya gönderilirken bir hata oluştu.' });
          }
        } else {
          console.log(`Rapor dosyası başarıyla gönderildi: ${report.file_name}`);
        }
      });

    } catch (error) {
      console.error('Rapor dosyası indirilirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Rapor dosyası indirilirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// YENİ: PUT /api/reports/:id - Belirli bir raporun meta verilerini güncelle
router.put(
  '/:id',
  protect,
  [ // Validasyon kuralları
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir rapor IDsi giriniz.'),
    body('type').optional().trim().notEmpty().withMessage('Rapor türü boş olamaz.').escape(),
    body('report_date').optional().isISO8601().toDate().withMessage('Geçerli bir rapor tarihi giriniz (YYYY-MM-DD).'),
    body('doctor_name').optional({nullable: true, checkFalsy: true}).trim().escape(), // Boş string veya null olabilir
    body('status').optional({nullable: true, checkFalsy: true}).trim().escape()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const reportId = parseInt(req.params.id);
    const { type, doctor_name, report_date, status } = req.body;
    console.log(`PUT /api/reports/${reportId} isteği, kullanıcı ID: ${userId}, Body:`, req.body);

    const fieldsToUpdate = [];
    const values = [];
    let queryParamIndex = 1;

    if (req.body.hasOwnProperty('type')) { fieldsToUpdate.push(`type = $${queryParamIndex++}`); values.push(type); }
    if (req.body.hasOwnProperty('doctor_name')) { fieldsToUpdate.push(`doctor_name = $${queryParamIndex++}`); values.push(doctor_name); }
    if (req.body.hasOwnProperty('report_date')) { fieldsToUpdate.push(`report_date = $${queryParamIndex++}`); values.push(report_date); }
    if (req.body.hasOwnProperty('status')) { fieldsToUpdate.push(`status = $${queryParamIndex++}`); values.push(status); }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ errors: [{ message: 'Güncellenecek en az bir alan göndermelisiniz.' }]});
    }

    values.push(reportId);
    values.push(userId);

    const updateQuery = `
      UPDATE reports
      SET ${fieldsToUpdate.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${queryParamIndex++} AND user_id = $${queryParamIndex}
      RETURNING *;
    `;

    try {
      const result = await db.query(updateQuery, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Güncellenecek rapor bulunamadı veya bu kullanıcıya ait değil.' });
      }
      console.log('Rapor meta verileri başarıyla güncellendi:', result.rows[0]);
      res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('Rapor meta verileri güncellenirken hata:', error);
      res.status(500).json({ errors: [{ message: 'Rapor meta verileri güncellenirken bir sunucu hatası oluştu.' }]});
    }
  }
);

// DELETE /api/reports/:id - Belirli bir raporu (meta veri ve dosya) sil
router.delete(
  '/:id', 
  protect,
  [
    param('id').isInt({ gt: 0 }).withMessage('Geçerli bir rapor IDsi giriniz.')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
      return res.status(400).json({ errors: formattedErrors });
    }

    const userId = req.user.userId;
    const reportId = parseInt(req.params.id);
    console.log(`DELETE /api/reports/${reportId} isteği, kullanıcı ID: ${userId}`);

    try {
        const reportResult = await db.query(
        'SELECT file_name, file_path FROM reports WHERE id = $1 AND user_id = $2',
        [reportId, userId]
        );

        if (reportResult.rows.length === 0) {
        return res.status(404).json({ message: 'Silinecek rapor bulunamadı veya bu kullanıcıya ait değil.' });
        }
        const reportToDelete = reportResult.rows[0];
        await db.query('DELETE FROM reports WHERE id = $1 AND user_id = $2', [reportId, userId]);

        if (reportToDelete.file_path) { // file_path null değilse dosyayı sil
            const absoluteFilePath = path.join(__dirname, '..', reportToDelete.file_path);
            if (fs.existsSync(absoluteFilePath)) {
                fs.unlink(absoluteFilePath, (err) => {
                if (err) console.error('Rapor dosyası silinirken hata:', err);
                else console.log('Rapor dosyası başarıyla silindi:', reportToDelete.file_name);
                });
            } else {
                console.warn('Silinecek rapor dosyası (DB kaydı vardı ama sistemde yok):', absoluteFilePath);
            }
        }
        console.log('Rapor başarıyla silindi (DB), ID:', reportId);
        res.status(204).send();
    } catch (error) {
        console.error('Rapor silinirken hata:', error);
        res.status(500).json({ errors: [{ message: 'Rapor silinirken bir sunucu hatası oluştu.' }]});
    }
});

module.exports = router;