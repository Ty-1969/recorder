const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

async function verifyUser(token) {
  if (!token) return null;
  
  try {
    const tokenData = Buffer.from(token, 'base64').toString('utf-8');
    const userId = tokenData.split(':')[0];
    
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('id, username, display_name')
      .eq('id', userId)
      .single();
    
    if (error || !profile) return null;
    
    return {
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name || profile.username
    };
  } catch (error) {
    return null;
  }
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!supabase) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: '資料庫連線未設定' })
    };
  }

  const token = event.headers.authorization?.replace('Bearer ', '');
  const user = await verifyUser(token);

  if (!user) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ success: false, error: '未授權' })
    };
  }

  try {
    const { httpMethod, path } = event;
    
    // 解析路徑：/.netlify/functions/categories/1/fields 或 /.netlify/functions/categories
    // Netlify Functions 的路徑格式：/.netlify/functions/categories 或 /.netlify/functions/categories/1/fields
    let categoryId = null;
    let isFieldsEndpoint = false;
    
    // 使用正則表達式匹配路徑
    const fieldsMatch = path.match(/categories\/(\d+)\/fields/);
    if (fieldsMatch) {
      categoryId = fieldsMatch[1];
      isFieldsEndpoint = true;
    } else {
      // 檢查是否只是 categories/數字
      const categoryMatch = path.match(/categories\/(\d+)$/);
      if (categoryMatch) {
        categoryId = categoryMatch[1];
      }
    }
    
    console.log('Categories path:', path, 'categoryId:', categoryId, 'isFieldsEndpoint:', isFieldsEndpoint);

    // GET: 取得所有類別
    if (httpMethod === 'GET' && !categoryId && !isFieldsEndpoint) {
      const { data, error } = await supabase
        .from('record_categories')
        .select('*')
        .or(`is_default.eq.true,user_id.eq.${user.id}`)
        .order('is_default', { ascending: false })
        .order('display_order', { ascending: true });

      if (error) throw error;

      // 過濾掉不需要的類別並去重
      const excludedNames = ['含氧量', '藥物', '大小便'];
      const uniqueCategories = [];
      const seenIds = new Set();
      
      (data || []).forEach(cat => {
        // 排除不需要的類別
        if (excludedNames.includes(cat.name)) {
          return;
        }
        // 去重
        if (cat && cat.id && !seenIds.has(cat.id)) {
          seenIds.add(cat.id);
          uniqueCategories.push(cat);
        }
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, categories: uniqueCategories })
      };
    }

    // GET: 取得類別的欄位定義
    if (httpMethod === 'GET' && categoryId && isFieldsEndpoint) {
      // 確保 categoryId 是數字
      const categoryIdNum = parseInt(categoryId);
      if (isNaN(categoryIdNum)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: '無效的類別 ID' })
        };
      }

      const { data, error } = await supabase
        .from('category_fields')
        .select('*')
        .eq('category_id', categoryIdNum)
        .order('display_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;

      // 調試：記錄原始資料
      console.log(`[Categories] 類別 ${categoryIdNum} 的原始欄位數量:`, (data || []).length);
      if (data && data.length > 0) {
        const fieldNames = data.map(f => f.field_name);
        const duplicates = fieldNames.filter((name, index) => fieldNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
          console.warn(`[Categories] 發現重複欄位名稱:`, duplicates);
        }
      }

      // 解析 field_options JSON 並去重（根據 field_name）
      // 使用 Map 確保每個 field_name 只保留一個
      const fieldsMap = new Map();
      (data || []).forEach((field, index) => {
        const fieldName = field.field_name;
        
        // 如果該欄位名稱尚未存在，直接加入
        if (!fieldsMap.has(fieldName)) {
          fieldsMap.set(fieldName, {
            ...field,
            _index: index,
            field_options: field.field_options ? (typeof field.field_options === 'string' ? JSON.parse(field.field_options) : field.field_options) : null
          });
        } else {
          // 如果已存在，比較並決定是否替換
          const existing = fieldsMap.get(fieldName);
          let shouldReplace = false;
          
          // 優先比較 display_order（較小者優先）
          if (field.display_order < existing.display_order) {
            shouldReplace = true;
          } else if (field.display_order === existing.display_order) {
            // display_order 相同時，優先保留 id 較小的
            if (field.id && existing.id) {
              shouldReplace = field.id < existing.id;
            } else if (field.id && !existing.id) {
              shouldReplace = true; // 有 id 的優先於沒有 id 的
            } else {
              // 都沒有 id 時，保留第一個遇到的（不替換）
              shouldReplace = false;
            }
          }
          
          if (shouldReplace) {
            console.log(`[Categories] 替換欄位 ${fieldName}: 舊 display_order=${existing.display_order}, 新 display_order=${field.display_order}`);
            fieldsMap.set(fieldName, {
              ...field,
              _index: index,
              field_options: field.field_options ? (typeof field.field_options === 'string' ? JSON.parse(field.field_options) : field.field_options) : null
            });
          } else {
            console.log(`[Categories] 跳過重複欄位 ${fieldName} (索引: ${index}), 保留已存在的`);
          }
        }
      });

      // 轉換回陣列並排序，移除臨時的 _index 屬性
      const fields = Array.from(fieldsMap.values())
        .map(field => {
          const { _index, ...rest } = field;
          return rest;
        })
        .sort((a, b) => {
          // 先按 display_order 排序
          if (a.display_order !== b.display_order) {
            return a.display_order - b.display_order;
          }
          // display_order 相同時，按 id 排序
          if (a.id && b.id) {
            return a.id - b.id;
          }
          return 0;
        });

      // 調試：確認去重後的結果
      console.log(`[Categories] 類別 ${categoryIdNum} 去重後的欄位數量:`, fields.length);
      const finalFieldNames = fields.map(f => f.field_name);
      const finalDuplicates = finalFieldNames.filter((name, index) => finalFieldNames.indexOf(name) !== index);
      if (finalDuplicates.length > 0) {
        console.error(`[Categories] 去重後仍有重複欄位:`, finalDuplicates);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, fields })
      };
    }

    // POST: 新增類別
    if (httpMethod === 'POST' && !categoryId) {
      const { name, icon } = JSON.parse(event.body || '{}');

      if (!name || !name.trim()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: '類別名稱為必填' })
        };
      }

      // 取得最大 display_order
      const { data: maxOrder } = await supabase
        .from('record_categories')
        .select('display_order')
        .eq('user_id', user.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      const { data, error } = await supabase
        .from('record_categories')
        .insert({
          user_id: user.id,
          name: name.trim(),
          icon: icon || '📝',
          is_default: false,
          display_order: (maxOrder?.display_order || 0) + 1
        })
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({ success: true, category: data })
      };
    }

    // PUT: 更新類別
    if (httpMethod === 'PUT' && categoryId) {
      const { name, icon } = JSON.parse(event.body || '{}');

      // 檢查類別是否存在且屬於該使用者
      const { data: existing } = await supabase
        .from('record_categories')
        .select('*')
        .eq('id', categoryId)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: '類別不存在' })
        };
      }

      if (existing.is_default) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: '無法修改預設類別' })
        };
      }

      if (existing.user_id !== user.id) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: '無權限修改此類別' })
        };
      }

      const updateData = {};
      if (name !== undefined) updateData.name = name.trim();
      if (icon !== undefined) updateData.icon = icon || '📝';

      const { data, error } = await supabase
        .from('record_categories')
        .update(updateData)
        .eq('id', categoryId)
        .select()
        .single();

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, category: data })
      };
    }

    // DELETE: 刪除類別
    if (httpMethod === 'DELETE' && categoryId) {
      // 檢查類別是否存在且屬於該使用者
      const { data: existing } = await supabase
        .from('record_categories')
        .select('*')
        .eq('id', categoryId)
        .single();

      if (!existing) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ success: false, error: '類別不存在' })
        };
      }

      if (existing.is_default) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: '無法刪除預設類別' })
        };
      }

      if (existing.user_id !== user.id) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ success: false, error: '無權限刪除此類別' })
        };
      }

      const { error } = await supabase
        .from('record_categories')
        .delete()
        .eq('id', categoryId);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, error: '找不到端點' })
    };

  } catch (error) {
    console.error('Function 錯誤:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message || '伺服器錯誤'
      })
    };
  }
};

