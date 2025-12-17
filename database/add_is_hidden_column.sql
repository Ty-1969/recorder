-- 為 record_categories 表添加 is_hidden 欄位
-- 用於標記類別是否隱藏（預設類別也可以隱藏）

-- 添加 is_hidden 欄位（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'record_categories' 
        AND column_name = 'is_hidden'
    ) THEN
        ALTER TABLE record_categories 
        ADD COLUMN is_hidden BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

