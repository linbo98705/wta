-- ═══════════════════════════════════════════════════════
-- 修复中国/中国香港球员的国家信息
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ═══════════════════════════════════════════════════════

-- 1. 修复 "中 国" → "中国"，country_code 设为 "CN"
UPDATE players
SET country = '中国', country_code = 'CN'
WHERE country LIKE '%中%国%' AND country NOT LIKE '%香港%';

-- 2. 修复 "中 国香港" → "中国香港"，country_code 设为 "HK"
UPDATE players
SET country = '中国香港', country_code = 'HK'
WHERE country LIKE '%中%国%香%港%';

-- 3. 修复 "中国香港" 但 country_code 为空的，设为 "HK"
UPDATE players
SET country_code = 'HK'
WHERE country = '中国香港' AND (country_code IS NULL OR country_code = '');

-- 4. 修复 "中国" 但 country_code 为空的，设为 "CN"
UPDATE players
SET country_code = 'CN'
WHERE country = '中国' AND (country_code IS NULL OR country_code = '');

-- 5. 验证修复结果
SELECT id, name, country, country_code
FROM players
WHERE country LIKE '%中%'
ORDER BY country, name;
