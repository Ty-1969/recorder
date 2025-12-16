const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');

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

      // 目前都返回 CSV 格式，所以檔名統一使用 .csv
      // 注意：Excel 可以開啟 CSV 檔案，所以不需要真正的 .xlsx 格式
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
      // PDF 匯出
      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
          });
          const chunks = [];
          
          doc.on('data', chunk => chunks.push(chunk));
          doc.on('end', () => {
            const pdfBuffer = Buffer.concat(chunks);
            const pdfBase64 = pdfBuffer.toString('base64');
            
            resolve({
              statusCode: 200,
              headers: {
                ...headers,
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="health_records_${startDate || 'all'}_${endDate || 'all'}.pdf"`
              },
              body: pdfBase64,
              isBase64Encoded: true
            });
          });
          
          doc.on('error', (error) => {
            reject(error);
          });
          
          // 標題
          doc.fontSize(20).text('Health Records Export', { align: 'center' });
          doc.moveDown(0.5);
          
          // 日期範圍
          if (startDate || endDate) {
            doc.fontSize(12).text(`Date Range: ${startDate || 'All'} to ${endDate || 'All'}`, { align: 'center' });
          }
          
          doc.moveDown();
          
          // 表格
          if (exportData.length > 0) {
            const tableHeaders = Object.keys(exportData[0]);
            const pageWidth = doc.page.width - 100;
            const colCount = tableHeaders.length;
            const colWidth = pageWidth / colCount;
            const startX = 50;
            let y = doc.y;
            
            // 表格標題
            doc.fontSize(10).font('Helvetica-Bold');
            tableHeaders.forEach((header, i) => {
              const x = startX + i * colWidth;
              doc.text(String(header), x, y, { width: colWidth - 5, align: 'left' });
            });
            
            y += 20;
            // 繪製分隔線
            doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
            y += 10;
            
            // 資料行
            doc.font('Helvetica').fontSize(9);
            exportData.forEach((row) => {
              if (y > 750) { // 換頁
                doc.addPage();
                y = 50;
                // 重新繪製標題
                doc.fontSize(10).font('Helvetica-Bold');
                tableHeaders.forEach((header, i) => {
                  const x = startX + i * colWidth;
                  doc.text(String(header), x, y, { width: colWidth - 5, align: 'left' });
                });
                y += 20;
                doc.moveTo(startX, y).lineTo(startX + pageWidth, y).stroke();
                y += 10;
                doc.font('Helvetica').fontSize(9);
              }
              
              tableHeaders.forEach((header, colIndex) => {
                const x = startX + colIndex * colWidth;
                const value = String(row[header] || '').substring(0, 30);
                doc.text(value, x, y, { width: colWidth - 5, align: 'left' });
              });
              
              y += 15;
            });
          } else {
            doc.fontSize(12).text('No data available', { align: 'center' });
          }
          
          // 頁尾
          const totalPages = doc.bufferedPageRange().count;
          for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fontSize(8)
              .text(`Page ${i + 1} of ${totalPages}`, 50, doc.page.height - 30, { align: 'center' });
          }
          
          doc.end();
        } catch (error) {
          reject(error);
        }
      }).catch((error) => {
        return {
          statusCode: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            success: false,
            error: 'PDF generation failed: ' + error.message
          })
        };
      });
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

