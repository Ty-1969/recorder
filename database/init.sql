-- 健康紀錄系統資料庫初始化腳本
-- 在 Supabase SQL Editor 中執行此腳本

-- 啟用必要的擴充功能
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 建立使用者資料表（簡化版，使用使用者名稱登入）
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立使用者名稱索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON user_profiles(username);

-- 建立紀錄類別資料表（預設類別和自訂類別）
CREATE TABLE IF NOT EXISTS record_categories (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(20) DEFAULT '📝',
    is_default BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立類別欄位定義表（定義每個類別有哪些欄位）
CREATE TABLE IF NOT EXISTS category_fields (
    id BIGSERIAL PRIMARY KEY,
    category_id BIGINT REFERENCES record_categories(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL,
    field_type VARCHAR(20) NOT NULL DEFAULT 'text', -- text, number, select, date, time
    field_label VARCHAR(100) NOT NULL,
    field_options JSONB, -- 用於 select 類型的選項
    is_required BOOLEAN DEFAULT FALSE,
    display_order INTEGER DEFAULT 0,
    unit VARCHAR(20), -- 單位：g, kg, bpm, %, 等
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立健康紀錄主表
CREATE TABLE IF NOT EXISTS health_records (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES record_categories(id) ON DELETE RESTRICT,
    record_date DATE NOT NULL,
    record_time TIME,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立紀錄資料表（儲存每個紀錄的欄位值）
CREATE TABLE IF NOT EXISTS record_data (
    id BIGSERIAL PRIMARY KEY,
    record_id BIGINT NOT NULL REFERENCES health_records(id) ON DELETE CASCADE,
    field_id BIGINT REFERENCES category_fields(id) ON DELETE SET NULL,
    field_name VARCHAR(50) NOT NULL, -- 保留欄位名稱以防欄位定義被刪除
    field_value TEXT,
    field_value_json JSONB, -- 用於複雜資料結構
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_health_records_user_date ON health_records(user_id, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_records_category ON health_records(category_id);
CREATE INDEX IF NOT EXISTS idx_health_records_date ON health_records(record_date DESC);
CREATE INDEX IF NOT EXISTS idx_record_data_record ON record_data(record_id);
CREATE INDEX IF NOT EXISTS idx_record_categories_user ON record_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_category_fields_category ON category_fields(category_id);

-- 建立更新時間的自動更新函數
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 建立觸發器
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_health_records_updated_at 
    BEFORE UPDATE ON health_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 插入預設類別（這些是系統預設，所有使用者共用）
-- 注意：實際使用時，這些應該在應用層動態建立，這裡只是範例
INSERT INTO record_categories (name, icon, is_default, display_order) VALUES
    ('飲食', '🍎', TRUE, 1),
    ('血壓', '🩺', TRUE, 2),
    ('心跳', '❤️', TRUE, 3),
    ('含氧量', '🫁', TRUE, 4),
    ('藥物', '💊', TRUE, 5),
    ('大小便', '🚽', TRUE, 6)
ON CONFLICT DO NOTHING;

-- 取得預設類別的 ID 並插入預設欄位
-- 飲食類別欄位
DO $$
DECLARE
    diet_category_id BIGINT;
BEGIN
    SELECT id INTO diet_category_id FROM record_categories WHERE name = '飲食' AND is_default = TRUE LIMIT 1;
    
    IF diet_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (diet_category_id, 'name', 'text', '名稱', TRUE, 1, NULL),
            (diet_category_id, 'quantity', 'number', '數量', FALSE, 2, '個'),
            (diet_category_id, 'weight', 'number', '重量', FALSE, 3, 'g')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 血壓類別欄位
DO $$
DECLARE
    bp_category_id BIGINT;
BEGIN
    SELECT id INTO bp_category_id FROM record_categories WHERE name = '血壓' AND is_default = TRUE LIMIT 1;
    
    IF bp_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (bp_category_id, 'systolic', 'number', '收縮壓', TRUE, 1, 'mmHg'),
            (bp_category_id, 'diastolic', 'number', '舒張壓', TRUE, 2, 'mmHg'),
            (bp_category_id, 'heart_rate', 'number', '心跳', FALSE, 3, 'bpm')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 心跳類別欄位
DO $$
DECLARE
    hr_category_id BIGINT;
BEGIN
    SELECT id INTO hr_category_id FROM record_categories WHERE name = '心跳' AND is_default = TRUE LIMIT 1;
    
    IF hr_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (hr_category_id, 'heart_rate', 'number', '心跳數', TRUE, 1, 'bpm')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 含氧量類別欄位
DO $$
DECLARE
    o2_category_id BIGINT;
BEGIN
    SELECT id INTO o2_category_id FROM record_categories WHERE name = '含氧量' AND is_default = TRUE LIMIT 1;
    
    IF o2_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (o2_category_id, 'oxygen_level', 'number', '含氧量', TRUE, 1, '%')
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 藥物類別欄位
DO $$
DECLARE
    med_category_id BIGINT;
BEGIN
    SELECT id INTO med_category_id FROM record_categories WHERE name = '藥物' AND is_default = TRUE LIMIT 1;
    
    IF med_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (med_category_id, 'medicine_name', 'text', '藥物名稱', TRUE, 1, NULL),
            (med_category_id, 'dose', 'number', '劑量', TRUE, 2, NULL),
            (med_category_id, 'unit', 'text', '單位', TRUE, 3, NULL)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- 大小便類別欄位
DO $$
DECLARE
    toilet_category_id BIGINT;
BEGIN
    SELECT id INTO toilet_category_id FROM record_categories WHERE name = '大小便' AND is_default = TRUE LIMIT 1;
    
    IF toilet_category_id IS NOT NULL THEN
        INSERT INTO category_fields (category_id, field_name, field_type, field_label, is_required, display_order, unit) VALUES
            (toilet_category_id, 'type', 'select', '類型', TRUE, 1, NULL),
            (toilet_category_id, 'count', 'number', '次數', FALSE, 2, '次')
        ON CONFLICT DO NOTHING;
        
        -- 更新類型欄位的選項
        UPDATE category_fields 
        SET field_options = '["大便", "小便"]'::jsonb
        WHERE category_id = toilet_category_id AND field_name = 'type';
    END IF;
END $$;

-- 啟用 Row Level Security (RLS)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE record_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_fields ENABLE ROW LEVEL SECURITY;

-- 建立 RLS 政策（簡化版，基於 token 中的使用者 ID）
-- 注意：實際的權限檢查在 Netlify Functions 中進行
CREATE POLICY "所有人可以讀取使用者資料" ON user_profiles
    FOR SELECT USING (true);

CREATE POLICY "所有人可以新增使用者資料" ON user_profiles
    FOR INSERT WITH CHECK (true);

CREATE POLICY "所有人可以修改使用者資料" ON user_profiles
    FOR UPDATE USING (true);

-- 健康紀錄：權限檢查在 Netlify Functions 中進行
-- RLS 政策設為允許所有操作，實際權限由 Functions 控制
CREATE POLICY "所有人可以讀取健康紀錄" ON health_records
    FOR SELECT USING (true);

CREATE POLICY "所有人可以新增健康紀錄" ON health_records
    FOR INSERT WITH CHECK (true);

CREATE POLICY "所有人可以修改健康紀錄" ON health_records
    FOR UPDATE USING (true);

CREATE POLICY "所有人可以刪除健康紀錄" ON health_records
    FOR DELETE USING (true);

-- 紀錄資料：權限檢查在 Netlify Functions 中進行
CREATE POLICY "所有人可以讀取紀錄資料" ON record_data
    FOR SELECT USING (true);

CREATE POLICY "所有人可以新增紀錄資料" ON record_data
    FOR INSERT WITH CHECK (true);

CREATE POLICY "所有人可以修改紀錄資料" ON record_data
    FOR UPDATE USING (true);

CREATE POLICY "所有人可以刪除紀錄資料" ON record_data
    FOR DELETE USING (true);

-- 類別：權限檢查在 Netlify Functions 中進行
CREATE POLICY "所有人可以讀取類別" ON record_categories
    FOR SELECT USING (true);

CREATE POLICY "所有人可以新增類別" ON record_categories
    FOR INSERT WITH CHECK (true);

CREATE POLICY "所有人可以修改類別" ON record_categories
    FOR UPDATE USING (true);

CREATE POLICY "所有人可以刪除類別" ON record_categories
    FOR DELETE USING (true);

-- 欄位定義：權限檢查在 Netlify Functions 中進行
CREATE POLICY "所有人可以讀取欄位定義" ON category_fields
    FOR SELECT USING (true);

CREATE POLICY "所有人可以新增欄位定義" ON category_fields
    FOR INSERT WITH CHECK (true);

CREATE POLICY "所有人可以修改欄位定義" ON category_fields
    FOR UPDATE USING (true);

CREATE POLICY "所有人可以刪除欄位定義" ON category_fields
    FOR DELETE USING (true);

-- 建立視圖：方便查詢完整紀錄
CREATE OR REPLACE VIEW health_records_full AS
SELECT 
    hr.id,
    hr.user_id,
    hr.category_id,
    rc.name AS category_name,
    rc.icon AS category_icon,
    hr.record_date,
    hr.record_time,
    hr.notes,
    hr.created_at,
    hr.updated_at,
    jsonb_object_agg(
        rd.field_name, 
        COALESCE(rd.field_value_json, to_jsonb(rd.field_value))
    ) FILTER (WHERE rd.field_name IS NOT NULL) AS data
FROM health_records hr
LEFT JOIN record_categories rc ON hr.category_id = rc.id
LEFT JOIN record_data rd ON hr.id = rd.record_id
GROUP BY hr.id, hr.user_id, hr.category_id, rc.name, rc.icon, hr.record_date, hr.record_time, hr.notes, hr.created_at, hr.updated_at;

-- 查詢驗證
SELECT '資料庫初始化完成！' AS status;
SELECT COUNT(*) AS default_categories FROM record_categories WHERE is_default = TRUE;
SELECT COUNT(*) AS category_fields FROM category_fields;

