const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_KEY?.trim();
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const headers = {
  'Content-Type': 'application/json',
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
    const period = parseInt(event.queryStringParameters?.period || '7');
    const queryDate = event.queryStringParameters?.date;
    const isSingleDay = period === 1;
    
    let startDateStr, endDateStr;
    if (isSingleDay && queryDate) {
      // 單日模式：使用指定的日期
      startDateStr = queryDate;
      endDateStr = queryDate;
    } else {
      // 多日模式：計算日期範圍
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - period);
      startDateStr = startDate.toISOString().split('T')[0];
      endDateStr = endDate.toISOString().split('T')[0];
    }

    // 先取得所有需要的類別 ID
    const { data: bpCategory } = await supabase
      .from('record_categories')
      .select('id')
      .eq('name', '血壓')
      .eq('is_default', true)
      .single();

    const { data: hrCategory } = await supabase
      .from('record_categories')
      .select('id')
      .eq('name', '心跳')
      .eq('is_default', true)
      .single();

    const { data: dietCategory } = await supabase
      .from('record_categories')
      .select('id')
      .eq('name', '飲食')
      .eq('is_default', true)
      .single();

    const { data: medCategory } = await supabase
      .from('record_categories')
      .select('id')
      .eq('name', '藥物')
      .eq('is_default', true)
      .single();

    // 取得血壓紀錄
    let bpRecords = null;
    if (bpCategory?.id) {
      const query = supabase
        .from('health_records')
        .select(`
          record_date,
          record_time,
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', bpCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      
      if (isSingleDay) {
        query.order('record_time', { ascending: true });
      } else {
        query.order('record_date', { ascending: true });
      }
      
      const { data } = await query;
      bpRecords = data;
    }

    // 取得心跳紀錄
    let hrRecords = null;
    if (hrCategory?.id) {
      const query = supabase
        .from('health_records')
        .select(`
          record_date,
          record_time,
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', hrCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      
      if (isSingleDay) {
        query.order('record_time', { ascending: true });
      } else {
        query.order('record_date', { ascending: true });
      }
      
      const { data } = await query;
      hrRecords = data;
    }

    // 取得飲食紀錄
    let dietRecords = null;
    if (dietCategory?.id) {
      const { data } = await supabase
        .from('health_records')
        .select(`
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', dietCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      dietRecords = data;
    }

    // 取得藥物紀錄
    let medRecords = null;
    if (medCategory?.id) {
      const { data } = await supabase
        .from('health_records')
        .select(`
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', medCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      medRecords = data;
    }

    // 處理血壓資料
    const bloodPressure = [];
    if (bpRecords) {
      const bpMap = new Map();
      bpRecords.forEach(record => {
        // 單日模式：使用日期+時間作為 key；多日模式：只使用日期
        const key = isSingleDay && record.record_time 
          ? `${record.record_date}T${record.record_time}` 
          : record.record_date;
        
        if (!bpMap.has(key)) {
          bpMap.set(key, {});
        }
        const data = bpMap.get(key);
        if (record.record_data) {
          record.record_data.forEach(item => {
            if (item.field_name === 'systolic') data.systolic = parseFloat(item.field_value) || 0;
            if (item.field_name === 'diastolic') data.diastolic = parseFloat(item.field_value) || 0;
            if (item.field_name === 'heart_rate') data.heart_rate = parseFloat(item.field_value) || 0;
          });
        }
      });
      bpMap.forEach((value, dateKey) => {
        if (value.systolic && value.diastolic) {
          bloodPressure.push({ date: dateKey, ...value });
        }
      });
    }

    // 處理心跳資料
    const heartRate = [];
    if (hrRecords) {
      const hrMap = new Map();
      hrRecords.forEach(record => {
        // 單日模式：使用日期+時間作為 key；多日模式：只使用日期
        const key = isSingleDay && record.record_time 
          ? `${record.record_date}T${record.record_time}` 
          : record.record_date;
        
        if (!hrMap.has(key)) {
          hrMap.set(key, { heart_rate: 0 });
        }
        if (record.record_data) {
          record.record_data.forEach(item => {
            if (item.field_name === 'heart_rate') {
              hrMap.get(key).heart_rate = parseFloat(item.field_value) || 0;
            }
          });
        }
      });
      hrMap.forEach((value, dateKey) => {
        if (value.heart_rate > 0) {
          heartRate.push({ date: dateKey, ...value });
        }
      });
    }

    // 處理飲食資料
    const diet = [];
    if (dietRecords) {
      const dietMap = new Map();
      dietRecords.forEach(record => {
        if (record.record_data) {
          let name = '';
          record.record_data.forEach(item => {
            if (item.field_name === 'name') name = item.field_value;
          });
          if (name) {
            dietMap.set(name, (dietMap.get(name) || 0) + 1);
          }
        }
      });
      dietMap.forEach((count, name) => {
        diet.push({ name, count });
      });
    }

    // 處理藥物資料
    const medication = [];
    if (medRecords) {
      const medMap = new Map();
      medRecords.forEach(record => {
        if (record.record_data) {
          let name = '';
          record.record_data.forEach(item => {
            if (item.field_name === 'medicine_name') name = item.field_value;
          });
          if (name) {
            medMap.set(name, (medMap.get(name) || 0) + 1);
          }
        }
      });
      medMap.forEach((count, name) => {
        medication.push({ name, count });
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats: {
          blood_pressure: bloodPressure,
          heart_rate: heartRate,
          diet: diet,
          medication: medication
        }
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

