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
      const { data, error } = await supabase
        .from('category_fields')
        .select('*')
        .eq('category_id', categoryId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      // 解析 field_options JSON
      const fields = (data || []).map(field => ({
        ...field,
        field_options: field.field_options ? (typeof field.field_options === 'string' ? JSON.parse(field.field_options) : field.field_options) : null
      }));

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

