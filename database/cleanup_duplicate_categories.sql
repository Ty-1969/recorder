-- 清理重複的類別記錄
-- 此腳本會分析 id 1,2,3 與 id 8,9,10 的資料量
-- 並刪除資料較少的那一組，同時將關聯資料遷移到保留的那一組

-- ============================================
-- 第一步：分析資料量
-- ============================================
-- 先執行此查詢來確認要保留哪一組

WITH group1_stats AS (
    SELECT 
        rc.id AS category_id,
        rc.name,
        COUNT(DISTINCT cf.id) AS field_count,
        COUNT(DISTINCT hr.id) AS record_count,
        COUNT(DISTINCT rd.id) AS record_data_count
    FROM record_categories rc
    LEFT JOIN category_fields cf ON rc.id = cf.category_id
    LEFT JOIN health_records hr ON rc.id = hr.category_id
    LEFT JOIN record_data rd ON hr.id = rd.record_id
    WHERE rc.id IN (1, 2, 3)
    GROUP BY rc.id, rc.name
),
group2_stats AS (
    SELECT 
        rc.id AS category_id,
        rc.name,
        COUNT(DISTINCT cf.id) AS field_count,
        COUNT(DISTINCT hr.id) AS record_count,
        COUNT(DISTINCT rd.id) AS record_data_count
    FROM record_categories rc
    LEFT JOIN category_fields cf ON rc.id = cf.category_id
    LEFT JOIN health_records hr ON rc.id = hr.category_id
    LEFT JOIN record_data rd ON hr.id = rd.record_id
    WHERE rc.id IN (8, 9, 10)
    GROUP BY rc.id, rc.name
),
group1_total AS (
    SELECT 
        SUM(field_count) AS total_fields,
        SUM(record_count) AS total_records,
        SUM(record_data_count) AS total_data,
        (SUM(field_count) + SUM(record_count) + SUM(record_data_count)) AS total_related
    FROM group1_stats
),
group2_total AS (
    SELECT 
        SUM(field_count) AS total_fields,
        SUM(record_count) AS total_records,
        SUM(record_data_count) AS total_data,
        (SUM(field_count) + SUM(record_count) + SUM(record_data_count)) AS total_related
    FROM group2_stats
)
SELECT 
    '組別 1 (id: 1,2,3)' AS group_name,
    g1.total_fields,
    g1.total_records,
    g1.total_data,
    g1.total_related,
    CASE 
        WHEN g1.total_related >= g2.total_related THEN '保留此組'
        ELSE '刪除此組'
    END AS action
FROM group1_total g1, group2_total g2
UNION ALL
SELECT 
    '組別 2 (id: 8,9,10)' AS group_name,
    g2.total_fields,
    g2.total_records,
    g2.total_data,
    g2.total_related,
    CASE 
        WHEN g2.total_related >= g1.total_related THEN '保留此組'
        ELSE '刪除此組'
    END AS action
FROM group1_total g1, group2_total g2;

-- ============================================
-- 第二步：遷移關聯資料（如果組別 2 資料較多）
-- ============================================
-- 只有在組別 2 (8,9,10) 資料較多時才需要執行此部分
-- 將組別 1 (1,2,3) 的關聯資料遷移到組別 2

BEGIN;

-- 遷移 health_records（飲食: 1 -> 8, 血壓: 2 -> 9, 心跳: 3 -> 10）
UPDATE health_records 
SET category_id = CASE 
    WHEN category_id = 1 THEN 8
    WHEN category_id = 2 THEN 9
    WHEN category_id = 3 THEN 10
END
WHERE category_id IN (1, 2, 3);

-- 遷移 category_fields（飲食: 1 -> 8, 血壓: 2 -> 9, 心跳: 3 -> 10）
UPDATE category_fields 
SET category_id = CASE 
    WHEN category_id = 1 THEN 8
    WHEN category_id = 2 THEN 9
    WHEN category_id = 3 THEN 10
END
WHERE category_id IN (1, 2, 3);

-- 刪除組別 1 的類別記錄
DELETE FROM record_categories WHERE id IN (1, 2, 3);

COMMIT;

-- ============================================
-- 替代方案：如果組別 1 資料較多，執行此部分
-- ============================================
-- 將組別 2 (8,9,10) 的關聯資料遷移到組別 1

-- BEGIN;
-- 
-- -- 遷移 health_records（飲食: 8 -> 1, 血壓: 9 -> 2, 心跳: 10 -> 3）
-- UPDATE health_records 
-- SET category_id = CASE 
--     WHEN category_id = 8 THEN 1
--     WHEN category_id = 9 THEN 2
--     WHEN category_id = 10 THEN 3
-- END
-- WHERE category_id IN (8, 9, 10);
-- 
-- -- 遷移 category_fields（飲食: 8 -> 1, 血壓: 9 -> 2, 心跳: 10 -> 3）
-- UPDATE category_fields 
-- SET category_id = CASE 
--     WHEN category_id = 8 THEN 1
--     WHEN category_id = 9 THEN 2
--     WHEN category_id = 10 THEN 3
-- END
-- WHERE category_id IN (8, 9, 10);
-- 
-- -- 刪除組別 2 的類別記錄
-- DELETE FROM record_categories WHERE id IN (8, 9, 10);
-- 
-- COMMIT;

-- ============================================
-- 驗證清理結果
-- ============================================
SELECT 
    id,
    name,
    icon,
    is_default,
    display_order,
    created_at
FROM record_categories
WHERE name IN ('飲食', '血壓', '心跳')
ORDER BY display_order, id;

