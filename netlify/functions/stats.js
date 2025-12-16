const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
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
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // 取得血壓紀錄
    const { data: bpRecords } = await supabase
      .from('health_records')
      .select(`
        record_date,
        record_data (field_name, field_value)
      `)
      .eq('user_id', user.id)
      .eq('category_id', (await supabase.from('record_categories').select('id').eq('name', '血壓').eq('is_default', true).single()).data?.id)
      .gte('record_date', startDateStr)
      .lte('record_date', endDateStr)
      .order('record_date', { ascending: true });

    // 取得心跳紀錄
    const { data: hrRecords } = await supabase
      .from('health_records')
      .select(`
        record_date,
        record_data (field_name, field_value)
      `)
      .eq('user_id', user.id)
      .eq('category_id', (await supabase.from('record_categories').select('id').eq('name', '心跳').eq('is_default', true).single()).data?.id)
      .gte('record_date', startDateStr)
      .lte('record_date', endDateStr)
      .order('record_date', { ascending: true });

    // 取得飲食紀錄
    const { data: dietRecords } = await supabase
      .from('health_records')
      .select(`
        record_data (field_name, field_value)
      `)
      .eq('user_id', user.id)
      .eq('category_id', (await supabase.from('record_categories').select('id').eq('name', '飲食').eq('is_default', true).single()).data?.id)
      .gte('record_date', startDateStr)
      .lte('record_date', endDateStr);

    // 取得藥物紀錄
    const { data: medRecords } = await supabase
      .from('health_records')
      .select(`
        record_data (field_name, field_value)
      `)
      .eq('user_id', user.id)
      .eq('category_id', (await supabase.from('record_categories').select('id').eq('name', '藥物').eq('is_default', true).single()).data?.id)
      .gte('record_date', startDateStr)
      .lte('record_date', endDateStr);

    // 處理血壓資料
    const bloodPressure = [];
    if (bpRecords) {
      const bpMap = new Map();
      bpRecords.forEach(record => {
        if (!bpMap.has(record.record_date)) {
          bpMap.set(record.record_date, {});
        }
        const data = bpMap.get(record.record_date);
        if (record.record_data) {
          record.record_data.forEach(item => {
            if (item.field_name === 'systolic') data.systolic = parseFloat(item.field_value) || 0;
            if (item.field_name === 'diastolic') data.diastolic = parseFloat(item.field_value) || 0;
          });
        }
      });
      bpMap.forEach((value, date) => {
        if (value.systolic && value.diastolic) {
          bloodPressure.push({ date, ...value });
        }
      });
    }

    // 處理心跳資料
    const heartRate = [];
    if (hrRecords) {
      const hrMap = new Map();
      hrRecords.forEach(record => {
        if (!hrMap.has(record.record_date)) {
          hrMap.set(record.record_date, { heart_rate: 0 });
        }
        if (record.record_data) {
          record.record_data.forEach(item => {
            if (item.field_name === 'heart_rate') {
              hrMap.get(record.record_date).heart_rate = parseFloat(item.field_value) || 0;
            }
          });
        }
      });
      hrMap.forEach((value, date) => {
        if (value.heart_rate > 0) {
          heartRate.push({ date, ...value });
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

