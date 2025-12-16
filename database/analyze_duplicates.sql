-- 分析重複類別的關聯資料量
-- 比較 id 1,2,3 與 id 8,9,10 的資料量

-- 1. 檢查 category_fields 的關聯數量
SELECT 
    'category_fields' AS table_name,
    category_id,
    COUNT(*) AS record_count
FROM category_fields
WHERE category_id IN (1, 2, 3, 8, 9, 10)
GROUP BY category_id
ORDER BY category_id;

-- 2. 檢查 health_records 的關聯數量
SELECT 
    'health_records' AS table_name,
    category_id,
    COUNT(*) AS record_count
FROM health_records
WHERE category_id IN (1, 2, 3, 8, 9, 10)
GROUP BY category_id
ORDER BY category_id;

-- 3. 統計各組的總關聯資料量
WITH group1_stats AS (
    SELECT 
        COUNT(DISTINCT cf.id) AS field_count,
        COUNT(DISTINCT hr.id) AS record_count
    FROM record_categories rc
    LEFT JOIN category_fields cf ON rc.id = cf.category_id
    LEFT JOIN health_records hr ON rc.id = hr.category_id
    WHERE rc.id IN (1, 2, 3)
),
group2_stats AS (
    SELECT 
        COUNT(DISTINCT cf.id) AS field_count,
        COUNT(DISTINCT hr.id) AS record_count
    FROM record_categories rc
    LEFT JOIN category_fields cf ON rc.id = cf.category_id
    LEFT JOIN health_records hr ON rc.id = hr.category_id
    WHERE rc.id IN (8, 9, 10)
)
SELECT 
    '組別 1 (id: 1,2,3)' AS group_name,
    g1.field_count AS category_fields_count,
    g1.record_count AS health_records_count,
    (g1.field_count + g1.record_count) AS total_related_data
FROM group1_stats g1
UNION ALL
SELECT 
    '組別 2 (id: 8,9,10)' AS group_name,
    g2.field_count AS category_fields_count,
    g2.record_count AS health_records_count,
    (g2.field_count + g2.record_count) AS total_related_data
FROM group2_stats g2;

-- 4. 詳細列出每個類別的關聯資料
SELECT 
    rc.id AS category_id,
    rc.name AS category_name,
    COUNT(DISTINCT cf.id) AS field_count,
    COUNT(DISTINCT hr.id) AS record_count,
    COUNT(DISTINCT rd.id) AS record_data_count
FROM record_categories rc
LEFT JOIN category_fields cf ON rc.id = cf.category_id
LEFT JOIN health_records hr ON rc.id = hr.category_id
LEFT JOIN record_data rd ON hr.id = rd.record_id
WHERE rc.id IN (1, 2, 3, 8, 9, 10)
GROUP BY rc.id, rc.name
ORDER BY rc.id;

