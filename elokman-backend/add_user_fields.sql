-- Users tablosuna birth_date ve gender alanlarını ekle
ALTER TABLE users 
ADD COLUMN birth_date DATE,
ADD COLUMN gender VARCHAR(10); 