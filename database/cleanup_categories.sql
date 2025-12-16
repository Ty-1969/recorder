-- 清理多餘的類別
-- 在 Supabase SQL Editor 中執行此腳本

-- 刪除不需要的預設類別
DELETE FROM record_categories 
WHERE name IN ('含氧量', '藥物', '大小便') 
AND is_default = TRUE;

-- 刪除這些類別的欄位定義
DELETE FROM category_fields 
WHERE category_id IN (
    SELECT id FROM record_categories 
    WHERE name IN ('含氧量', '藥物', '大小便') 
    AND is_default = TRUE
);

-- 查詢驗證：應該只剩下 5 個預設類別
SELECT id, name, icon, is_default, display_order 
FROM record_categories 
WHERE is_default = TRUE 
ORDER BY display_order;

