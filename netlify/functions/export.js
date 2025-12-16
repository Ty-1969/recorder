const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
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
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: '資料庫連線未設定' })
    };
  }

  const token = event.headers.authorization?.replace('Bearer ', '');
  const user = await verifyUser(token);

  if (!user) {
    return {
      statusCode: 401,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: '未授權' })
    };
  }

  try {
    const format = event.queryStringParameters?.format || 'csv';
    const startDate = event.queryStringParameters?.start_date;
    const endDate = event.queryStringParameters?.end_date;

    // 取得紀錄
    let query = supabase
      .from('health_records')
      .select(`
        *,
        record_categories (name, icon),
        record_data (field_name, field_value, field_value_json)
      `)
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .order('record_time', { ascending: false });

    if (startDate) query = query.gte('record_date', startDate);
    if (endDate) query = query.lte('record_date', endDate);

    const { data: records, error } = await query;

    if (error) throw error;

    // 整理資料
    const exportData = (records || []).map(record => {
      const row = {
        '日期': record.record_date,
        '時間': record.record_time || '',
        '類別': record.record_categories?.name || '未知',
        '備註': record.notes || ''
      };

      if (record.record_data) {
        record.record_data.forEach(item => {
          const value = item.field_value_json || item.field_value;
          row[item.field_name] = value !== null && value !== undefined ? String(value) : '';
        });
      }

      return row;
    });

    if (format === 'csv' || format === 'excel') {
      // CSV 匯出
      const headers = Object.keys(exportData[0] || {});
      const csv = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n');

      const csvWithBOM = '\ufeff' + csv; // UTF-8 BOM for Excel

      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="health_records_${startDate || 'all'}_${endDate || 'all'}.csv"`
        },
        body: csvWithBOM
      };
    }

    if (format === 'pdf') {
      // PDF 匯出（簡化版，實際應該使用 PDF 庫）
      // 這裡返回 JSON，前端可以處理或使用第三方服務
      return {
        statusCode: 200,
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          success: true,
          message: 'PDF 匯出功能需要額外的 PDF 生成庫，目前返回 JSON 格式',
          data: exportData
        })
      };
    }

    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: '不支援的格式' })
    };

  } catch (error) {
    console.error('Function 錯誤:', error);
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message || '伺服器錯誤'
      })
    };
  }
};

