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
    const pathParts = path.split('/');
    const categoryId = pathParts[pathParts.length - 2] === 'categories' && pathParts[pathParts.length - 1] !== 'categories' 
      ? pathParts[pathParts.length - 1] 
      : null;
    const isFieldsEndpoint = pathParts[pathParts.length - 1] === 'fields';

    // GET: 取得所有類別
    if (httpMethod === 'GET' && !categoryId && !isFieldsEndpoint) {
      const { data, error } = await supabase
        .from('record_categories')
        .select('*')
        .or(`is_default.eq.true,user_id.eq.${user.id}`)
        .order('is_default', { ascending: false })
        .order('display_order', { ascending: true });

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, categories: data || [] })
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

