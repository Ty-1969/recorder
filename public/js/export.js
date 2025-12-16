// 資料匯出功能
async function exportData(format) {
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const startDate = getWeekStart(currentDate).toISOString().split('T')[0];
        const endDate = getWeekEnd(currentDate).toISOString().split('T')[0];
        
        const response = await fetch(
            `${API_BASE}/records/export?format=${format}&start_date=${startDate}&end_date=${endDate}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // 後端返回的是 CSV 格式，所以 Excel 匯出也使用 .csv 副檔名
            const extension = format === 'pdf' ? 'pdf' : 'csv';
            a.download = `health_records_${startDate}_${endDate}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            const data = await response.json();
            alert(data.error || '匯出失敗');
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

// 簡化版 Excel 匯出（前端實作）
function exportToExcel() {
    const data = records.map(record => {
        const category = categories.find(c => c.id === record.category_id);
        const row = {
            '日期': record.record_date,
            '時間': record.record_time || '',
            '類別': category ? category.name : '未知',
            '備註': record.notes || ''
        };
        
        if (record.data) {
            Object.entries(record.data).forEach(([key, value]) => {
                row[key] = value;
            });
        }
        
        return row;
    });
    
    // 建立 CSV
    const headers = Object.keys(data[0] || {});
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\n');
    
    // 下載
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `health_records_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

