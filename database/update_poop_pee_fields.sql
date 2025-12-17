-- 更新大號和小號類別的欄位定義
-- 將"次數"改為"重量"，大號單位改為"g"，小號單位改為"c.c."

-- 更新大號類別的欄位
UPDATE category_fields
SET 
    field_name = 'weight',
    field_label = '重量',
    unit = 'g'
WHERE category_id IN (
    SELECT id FROM record_categories WHERE name = '大號' AND is_default = TRUE
)
AND field_name = 'count'
AND field_label = '次數';

-- 更新小號類別的欄位
UPDATE category_fields
SET 
    field_name = 'weight',
    field_label = '重量',
    unit = 'c.c.'
WHERE category_id IN (
    SELECT id FROM record_categories WHERE name = '小號' AND is_default = TRUE
)
AND field_name = 'count'
AND field_label = '次數';

-- 更新現有紀錄資料中的欄位名稱（從 count 改為 weight）
UPDATE record_data
SET field_name = 'weight'
WHERE field_name = 'count'
AND record_id IN (
    SELECT hr.id 
    FROM health_records hr
    INNER JOIN record_categories rc ON hr.category_id = rc.id
    WHERE rc.name IN ('大號', '小號') AND rc.is_default = TRUE
);

