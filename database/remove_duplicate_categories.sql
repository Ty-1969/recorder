-- 刪除重複的預設類別
-- 保留較早的 ID（1, 2, 3），刪除較新的重複項（8, 9, 10）

-- 步驟 1: 先檢查哪些類別有重複
SELECT name, COUNT(*) as count, array_agg(id ORDER BY id) as ids
FROM record_categories 
WHERE is_default = TRUE 
GROUP BY name 
HAVING COUNT(*) > 1
ORDER BY name;

-- 步驟 2: 將使用重複類別 ID 的紀錄更新為使用原始類別 ID
-- 更新 health_records 中的 category_id
UPDATE health_records 
SET category_id = CASE 
    WHEN category_id = 8 THEN 1  -- 飲食: 8 -> 1
    WHEN category_id = 9 THEN 2  -- 血壓: 9 -> 2
    WHEN category_id = 10 THEN 3 -- 心跳: 10 -> 3
    ELSE category_id
END
WHERE category_id IN (8, 9, 10);

-- 步驟 3: 刪除重複類別的欄位定義
DELETE FROM category_fields 
WHERE category_id IN (8, 9, 10);

-- 步驟 4: 刪除重複的類別
DELETE FROM record_categories 
WHERE id IN (8, 9, 10) 
AND is_default = TRUE;

-- 步驟 5: 驗證結果（應該只剩下 5 個類別，每個只出現一次）
SELECT id, name, icon, is_default, display_order 
FROM record_categories 
WHERE is_default = TRUE 
ORDER BY display_order, id;



