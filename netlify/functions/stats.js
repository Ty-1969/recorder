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

    // 取得所有未隱藏的類別
    const { data: allCategories, error: categoriesError } = await supabase
      .from('record_categories')
      .select('id, name, icon')
      .or(`is_default.eq.true,user_id.eq.${user.id}`)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .order('is_default', { ascending: false })
      .order('display_order', { ascending: true });

    if (categoriesError) throw categoriesError;

    // 過濾掉不需要的類別（只排除含氧量，其他都包含）
    const excludedNames = ['含氧量'];
    const visibleCategories = (allCategories || []).filter(cat => 
      cat && cat.id && !excludedNames.includes(cat.name)
    );

    // 為了向後兼容，保留原有的類別查詢（用於特殊處理）
    const bpCategory = visibleCategories.find(c => c.name === '血壓');
    const hrCategory = visibleCategories.find(c => c.name === '心跳');
    const dietCategory = visibleCategories.find(c => c.name === '飲食');
    const medCategory = visibleCategories.find(c => c.name === '藥物');
    const poopCategory = visibleCategories.find(c => c.name === '大號');
    const peeCategory = visibleCategories.find(c => c.name === '小號');

    // 為了向後兼容，先處理特殊類別（血壓、心跳、飲食、藥物）
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

    // 取得大號紀錄
    let poopRecords = null;
    if (poopCategory?.id) {
      const query = supabase
        .from('health_records')
        .select(`
          record_date,
          record_time,
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', poopCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      
      if (isSingleDay) {
        query.order('record_time', { ascending: true });
      } else {
        query.order('record_date', { ascending: true }).order('record_time', { ascending: true });
      }
      
      const { data } = await query;
      poopRecords = data;
    }

    // 取得小號紀錄
    let peeRecords = null;
    if (peeCategory?.id) {
      const query = supabase
        .from('health_records')
        .select(`
          record_date,
          record_time,
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .eq('category_id', peeCategory.id)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      
      if (isSingleDay) {
        query.order('record_time', { ascending: true });
      } else {
        query.order('record_date', { ascending: true }).order('record_time', { ascending: true });
      }
      
      const { data } = await query;
      peeRecords = data;
    }

    // 取得其他未隱藏類別的紀錄（包括使用者自訂類別）
    const otherCategoryIds = visibleCategories
      .filter(cat => !['血壓', '心跳', '飲食', '藥物', '大號', '小號'].includes(cat.name))
      .map(cat => cat.id);
    
    let otherRecords = [];
    if (otherCategoryIds.length > 0) {
      const query = supabase
        .from('health_records')
        .select(`
          id,
          category_id,
          record_date,
          record_time,
          record_data (field_name, field_value)
        `)
        .eq('user_id', user.id)
        .in('category_id', otherCategoryIds)
        .gte('record_date', startDateStr)
        .lte('record_date', endDateStr);
      
      if (isSingleDay) {
        query.order('record_time', { ascending: true });
      } else {
        query.order('record_date', { ascending: true });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      otherRecords = data || [];
    }

    // 按類別分組其他類別的紀錄
    const recordsByCategory = new Map();
    visibleCategories
      .filter(cat => !['血壓', '心跳', '飲食', '藥物'].includes(cat.name))
      .forEach(cat => {
        recordsByCategory.set(cat.id, {
          category: cat,
          records: otherRecords.filter(r => r.category_id === cat.id)
        });
      });

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

    // 構建所有類別的統計數據
    const allCategoryStats = {};
    
    // 處理特殊類別（血壓、心跳、飲食、藥物）
    if (bpCategory && bloodPressure.length > 0) {
      allCategoryStats[bpCategory.id] = {
        category_id: bpCategory.id,
        category_name: bpCategory.name,
        category_icon: bpCategory.icon,
        type: 'line',
        data: bloodPressure
      };
    }
    
    if (hrCategory && heartRate.length > 0) {
      allCategoryStats[hrCategory.id] = {
        category_id: hrCategory.id,
        category_name: hrCategory.name,
        category_icon: hrCategory.icon,
        type: 'line',
        data: heartRate
      };
    }
    
    if (dietCategory && diet.length > 0) {
      allCategoryStats[dietCategory.id] = {
        category_id: dietCategory.id,
        category_name: dietCategory.name,
        category_icon: dietCategory.icon,
        type: 'pie',
        data: diet
      };
    }
    
    if (medCategory && medication.length > 0) {
      allCategoryStats[medCategory.id] = {
        category_id: medCategory.id,
        category_name: medCategory.name,
        category_icon: medCategory.icon,
        type: 'bar',
        data: medication
      };
    }
    
    // 處理大號統計（每筆紀錄的時間與數字）
    if (poopCategory && poopRecords) {
      let totalWeight = 0;
      let recordCount = 0;
      const weightData = [];
      
      poopRecords.forEach(record => {
        if (record.record_data) {
          const weightField = record.record_data.find(item => item.field_name === 'weight');
          if (weightField && weightField.field_value) {
            const weight = parseFloat(weightField.field_value) || 0;
            totalWeight += weight;
            recordCount++;
            // 單日模式：使用日期+時間；多日模式：使用日期+時間
            const dateKey = record.record_time 
              ? `${record.record_date}T${record.record_time}` 
              : record.record_date;
            weightData.push({
              date: dateKey,
              weight: weight,
              record_date: record.record_date,
              record_time: record.record_time
            });
          }
        }
      });
      
      if (recordCount > 0) {
        // 格式化日期函數
        const formatDate = (dateStr) => {
          const date = new Date(dateStr);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        };
        
        const formatHour = (dateStr, timeStr) => {
          // 如果有時間，顯示日期+時間；否則只顯示日期
          if (timeStr) {
            return `${formatDate(dateStr)} ${timeStr.substring(0, 5)}`;
          }
          return formatDate(dateStr);
        };
        
        // 按時間排序，每筆紀錄都顯示
        const chartData = weightData
          .sort((a, b) => {
            // 先按日期排序，再按時間排序
            const dateCompare = a.record_date.localeCompare(b.record_date);
            if (dateCompare !== 0) return dateCompare;
            if (a.record_time && b.record_time) {
              return a.record_time.localeCompare(b.record_time);
            }
            return 0;
          })
          .map(item => ({
            name: item.record_time ? formatHour(item.record_date, item.record_time) : formatDate(item.record_date),
            count: item.weight,
            date: item.date
          }));
        
        allCategoryStats[poopCategory.id] = {
          category_id: poopCategory.id,
          category_name: poopCategory.name,
          category_icon: poopCategory.icon,
          type: 'bar',
          data: chartData,
          total: totalWeight,
          count: recordCount,
          unit: 'g'
        };
      }
    }
    
    // 處理小號統計（每筆紀錄的時間與數字）
    if (peeCategory && peeRecords) {
      let totalWeight = 0;
      let recordCount = 0;
      const weightData = [];
      
      peeRecords.forEach(record => {
        if (record.record_data) {
          const weightField = record.record_data.find(item => item.field_name === 'weight');
          if (weightField && weightField.field_value) {
            const weight = parseFloat(weightField.field_value) || 0;
            totalWeight += weight;
            recordCount++;
            // 單日模式：使用日期+時間；多日模式：使用日期+時間
            const dateKey = record.record_time 
              ? `${record.record_date}T${record.record_time}` 
              : record.record_date;
            weightData.push({
              date: dateKey,
              weight: weight,
              record_date: record.record_date,
              record_time: record.record_time
            });
          }
        }
      });
      
      if (recordCount > 0) {
        // 格式化日期函數
        const formatDate = (dateStr) => {
          const date = new Date(dateStr);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        };
        
        const formatHour = (dateStr, timeStr) => {
          // 如果有時間，顯示日期+時間；否則只顯示日期
          if (timeStr) {
            return `${formatDate(dateStr)} ${timeStr.substring(0, 5)}`;
          }
          return formatDate(dateStr);
        };
        
        // 按時間排序，每筆紀錄都顯示
        const chartData = weightData
          .sort((a, b) => {
            // 先按日期排序，再按時間排序
            const dateCompare = a.record_date.localeCompare(b.record_date);
            if (dateCompare !== 0) return dateCompare;
            if (a.record_time && b.record_time) {
              return a.record_time.localeCompare(b.record_time);
            }
            return 0;
          })
          .map(item => ({
            name: item.record_time ? formatHour(item.record_date, item.record_time) : formatDate(item.record_date),
            count: item.weight,
            date: item.date
          }));
        
        allCategoryStats[peeCategory.id] = {
          category_id: peeCategory.id,
          category_name: peeCategory.name,
          category_icon: peeCategory.icon,
          type: 'bar',
          data: chartData,
          total: totalWeight,
          count: recordCount,
          unit: 'c.c.'
        };
      }
    }
    
    // 為其他類別生成統計數據（包括使用者自訂類別）
    recordsByCategory.forEach(({ category, records }) => {
      if (records.length === 0) {
        return; // 跳過沒有紀錄的類別
      }

      // 其他類別：使用預設的統計方式（計數統計）
      const countMap = new Map();
      records.forEach(record => {
        if (record.record_data && record.record_data.length > 0) {
          // 使用第一個有值的欄位作為統計依據
          const firstField = record.record_data.find(item => 
            item.field_value && item.field_value.trim() !== ''
          );
          if (firstField) {
            const value = firstField.field_value;
            countMap.set(value, (countMap.get(value) || 0) + 1);
          }
        }
      });
      
      const categoryData = [];
      countMap.forEach((count, value) => {
        categoryData.push({
          name: value,
          count: count
        });
      });

      if (categoryData.length > 0) {
        allCategoryStats[category.id] = {
          category_id: category.id,
          category_name: category.name,
          category_icon: category.icon,
          type: 'bar',
          data: categoryData
        };
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats: {
          blood_pressure: bloodPressure,
          heart_rate: heartRate,
          diet: diet,
          medication: medication,
          categories: allCategoryStats
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

