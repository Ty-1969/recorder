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

// 驗證使用者（簡化版，基於 token）
async function verifyUser(token) {
  if (!token) return null;
  
  try {
    // 解析 token 取得使用者 ID
    const tokenData = Buffer.from(token, 'base64').toString('utf-8');
    const userId = tokenData.split(':')[0];
    
    // 驗證使用者是否存在
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
    const { httpMethod, queryStringParameters, path } = event;
    const recordId = path.split('/').pop();

    // GET: 取得紀錄列表
    if (httpMethod === 'GET' && !recordId) {
      const startDate = queryStringParameters?.start_date;
      const endDate = queryStringParameters?.end_date;
      const categoryId = queryStringParameters?.category_id;

      let query = supabase
        .from('health_records')
        .select(`
          *,
          record_categories (
            id,
            name,
            icon
          ),
          record_data (*)
        `)
        .eq('user_id', user.id);
      
      // 先排序日期，再排序時間
      query = query.order('record_date', { ascending: false });
      if (query.order) {
        // Supabase 允許多個 order，但需要分別調用
        // 這裡先按日期排序，時間排序在應用層處理
      }

      if (startDate) {
        query = query.gte('record_date', startDate);
      }
      if (endDate) {
        query = query.lte('record_date', endDate);
      }
      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('查詢紀錄錯誤:', error);
        throw error;
      }

      // 整理資料格式
      const records = (data || []).map(record => {
        const dataObj = {};
        if (record.record_data && Array.isArray(record.record_data)) {
          record.record_data.forEach(item => {
            if (item && item.field_name) {
              dataObj[item.field_name] = item.field_value_json !== null && item.field_value_json !== undefined 
                ? item.field_value_json 
                : item.field_value;
            }
          });
        }

        return {
          id: record.id,
          category_id: record.category_id,
          category_name: record.record_categories?.name,
          category_icon: record.record_categories?.icon,
          record_date: record.record_date,
          record_time: record.record_time,
          notes: record.notes,
          data: dataObj,
          created_at: record.created_at,
          updated_at: record.updated_at
        };
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, records })
      };
    }

    // GET: 取得單一紀錄
    if (httpMethod === 'GET' && recordId) {
      const { data, error } = await supabase
        .from('health_records')
        .select(`
          *,
          record_categories (*),
          record_data (*)
        `)
        .eq('id', recordId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;

      const dataObj = {};
      if (data.record_data) {
        data.record_data.forEach(item => {
          dataObj[item.field_name] = item.field_value_json || item.field_value;
        });
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          record: {
            ...data,
            data: dataObj
          }
        })
      };
    }

    // POST: 新增紀錄
    if (httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { category_id, record_date, record_time, notes, data: recordData } = body;

      console.log('收到新增紀錄請求:', body);

      if (!category_id || category_id === '' || isNaN(parseInt(category_id))) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: '類別為必填'
          })
        };
      }

      if (!record_date || record_date === '') {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: '日期為必填'
          })
        };
      }

      // 新增主紀錄
      const { data: record, error: recordError } = await supabase
        .from('health_records')
        .insert({
          user_id: user.id,
          category_id,
          record_date,
          record_time: record_time || null,
          notes: notes || null
        })
        .select()
        .single();

      if (recordError) throw recordError;

      // 新增紀錄資料
      if (recordData && Object.keys(recordData).length > 0) {
        const recordDataArray = Object.entries(recordData).map(([field_name, field_value]) => ({
          record_id: record.id,
          field_name,
          field_value: typeof field_value === 'string' ? field_value : null,
          field_value_json: typeof field_value !== 'string' ? field_value : null
        }));

        const { error: dataError } = await supabase
          .from('record_data')
          .insert(recordDataArray);

        if (dataError) {
          // 如果資料插入失敗，刪除主紀錄
          await supabase.from('health_records').delete().eq('id', record.id);
          throw dataError;
        }
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          record: { id: record.id }
        })
      };
    }

    // PUT: 更新紀錄
    if (httpMethod === 'PUT' && recordId) {
      const { category_id, record_date, record_time, notes, data: recordData } = JSON.parse(event.body || '{}');

      // 更新主紀錄
      const updateData = {};
      if (category_id !== undefined) updateData.category_id = category_id;
      if (record_date !== undefined) updateData.record_date = record_date;
      if (record_time !== undefined) updateData.record_time = record_time;
      if (notes !== undefined) updateData.notes = notes;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('health_records')
          .update(updateData)
          .eq('id', recordId)
          .eq('user_id', user.id);

        if (updateError) throw updateError;
      }

      // 更新紀錄資料
      if (recordData) {
        // 刪除舊資料
        await supabase
          .from('record_data')
          .delete()
          .eq('record_id', recordId);

        // 插入新資料
        if (Object.keys(recordData).length > 0) {
          const recordDataArray = Object.entries(recordData).map(([field_name, field_value]) => ({
            record_id: recordId,
            field_name,
            field_value: typeof field_value === 'string' ? field_value : null,
            field_value_json: typeof field_value !== 'string' ? field_value : null
          }));

          const { error: dataError } = await supabase
            .from('record_data')
            .insert(recordDataArray);

          if (dataError) throw dataError;
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // DELETE: 刪除紀錄
    if (httpMethod === 'DELETE' && recordId) {
      const { error } = await supabase
        .from('health_records')
        .delete()
        .eq('id', recordId)
        .eq('user_id', user.id);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: '不支援的 HTTP 方法'
      })
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

