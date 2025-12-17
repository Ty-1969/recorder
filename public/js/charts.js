// 圖表功能
let charts = {};

// 載入統計資料
async function loadStats() {
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const period = document.getElementById('statsPeriod').value || '7';
        const statsDate = document.getElementById('statsDate');
        
        // 顯示/隱藏日期選擇器
        if (period === '1') {
            statsDate.style.display = 'block';
            if (!statsDate.value) {
                // 如果沒有選擇日期，預設為今天
                const today = new Date();
                statsDate.value = today.toISOString().split('T')[0];
            }
        } else {
            statsDate.style.display = 'none';
        }
        
        let url = `${API_BASE}/stats?period=${period}`;
        if (period === '1' && statsDate.value) {
            url += `&date=${statsDate.value}`;
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderCharts(data.stats, period === '1');
        }
    } catch (error) {
        console.error('載入統計失敗:', error);
    } finally {
        hideLoading();
    }
}

// 渲染所有圖表
function renderCharts(stats, isSingleDay = false) {
    renderBPChart(stats.blood_pressure || [], isSingleDay);
    renderHRChart(stats.heart_rate || [], isSingleDay);
    renderDietChart(stats.diet || []);
    renderMedChart(stats.medication || []);
}

// 血壓趨勢圖
function renderBPChart(data, isSingleDay = false) {
    const chartCard = document.querySelector('#bpChart')?.parentElement;
    if (!chartCard) return;
    
    // 如果沒有資料，顯示提示訊息
    if (!data || data.length === 0) {
        if (charts.bp) {
            charts.bp.destroy();
            charts.bp = null;
        }
        chartCard.innerHTML = '<h3>血壓趨勢</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無血壓紀錄</div>';
        return;
    }
    
    // 恢復 canvas 元素
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = '<h3>血壓趨勢</h3><canvas id="bpChart"></canvas>';
    }
    
    const ctx = document.getElementById('bpChart');
    if (!ctx) return;
    
    const labels = data.map(d => isSingleDay ? formatChartHour(d.date) : formatChartDate(d.date));
    const systolic = data.map(d => d.systolic);
    const diastolic = data.map(d => d.diastolic);
    const heartRate = data.map(d => d.heart_rate || null);
    
    // 檢查是否有心跳數據
    const hasHeartRate = heartRate.some(hr => hr !== null && hr > 0);
    
    if (charts.bp) {
        charts.bp.destroy();
    }
    
    const datasets = [
        {
            label: '收縮壓',
            data: systolic,
            borderColor: '#f87171',
            backgroundColor: 'rgba(248, 113, 113, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
        },
        {
            label: '舒張壓',
            data: diastolic,
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
        }
    ];
    
    // 如果有心跳數據，添加到圖表中
    if (hasHeartRate) {
        datasets.push({
            label: '心跳',
            data: heartRate,
            borderColor: '#4a9eff',
            backgroundColor: 'rgba(74, 158, 255, 0.1)',
            tension: 0.4,
            fill: false,
            yAxisID: 'y1',
            borderDash: [5, 5]
        });
    }
    
    charts.bp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    labels: {
                        color: '#b0b0b0'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' },
                    title: {
                        display: true,
                        text: 'mmHg',
                        color: '#b0b0b0'
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    ticks: { color: '#707070' },
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: 'bpm',
                        color: '#b0b0b0'
                    }
                }
            }
        }
    });
}

// 心跳趨勢圖
function renderHRChart(data, isSingleDay = false) {
    const chartCard = document.querySelector('#hrChart')?.parentElement;
    if (!chartCard) return;
    
    // 如果沒有資料，顯示提示訊息
    if (!data || data.length === 0) {
        if (charts.hr) {
            charts.hr.destroy();
            charts.hr = null;
        }
        chartCard.innerHTML = '<h3>心跳趨勢</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無心跳紀錄</div>';
        return;
    }
    
    // 恢復 canvas 元素
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = '<h3>心跳趨勢</h3><canvas id="hrChart"></canvas>';
    }
    
    const ctx = document.getElementById('hrChart');
    if (!ctx) return;
    
    const labels = data.map(d => isSingleDay ? formatChartHour(d.date) : formatChartDate(d.date));
    const values = data.map(d => d.heart_rate);
    
    if (charts.hr) {
        charts.hr.destroy();
    }
    
    charts.hr = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '心跳數 (bpm)',
                data: values,
                borderColor: '#4a9eff',
                backgroundColor: 'rgba(74, 158, 255, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    labels: {
                        color: '#b0b0b0'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' }
                },
                y: {
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' },
                    title: {
                        display: true,
                        text: 'bpm',
                        color: '#b0b0b0'
                    }
                }
            }
        }
    });
}

// 飲食統計圖
function renderDietChart(data) {
    const chartCard = document.querySelector('#dietChart')?.parentElement;
    if (!chartCard) return;
    
    // 如果沒有資料，顯示提示訊息
    if (!data || data.length === 0) {
        if (charts.diet) {
            charts.diet.destroy();
            charts.diet = null;
        }
        chartCard.innerHTML = '<h3>飲食統計</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無飲食紀錄</div>';
        return;
    }
    
    // 恢復 canvas 元素
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = '<h3>飲食統計</h3><canvas id="dietChart"></canvas>';
    }
    
    const ctx = document.getElementById('dietChart');
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    const colors = generateColors(labels.length);
    
    if (charts.diet) {
        charts.diet.destroy();
    }
    
    charts.diet = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: '#1f1f1f',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#b0b0b0',
                        padding: 15
                    }
                }
            }
        }
    });
}

// 藥物使用統計
function renderMedChart(data) {
    const chartCard = document.querySelector('#medChart')?.parentElement;
    if (!chartCard) return;
    
    // 如果沒有資料，顯示提示訊息
    if (!data || data.length === 0) {
        if (charts.med) {
            charts.med.destroy();
            charts.med = null;
        }
        chartCard.innerHTML = '<h3>藥物使用</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無藥物紀錄</div>';
        return;
    }
    
    // 恢復 canvas 元素
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = '<h3>藥物使用</h3><canvas id="medChart"></canvas>';
    }
    
    const ctx = document.getElementById('medChart');
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    
    if (charts.med) {
        charts.med.destroy();
    }
    
    charts.med = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '使用次數',
                data: values,
                backgroundColor: '#4a9eff',
                borderColor: '#6bb6ff',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' }
                },
                y: {
                    ticks: { color: '#707070' },
                    grid: { color: '#333333' },
                    beginAtZero: true
                }
            }
        }
    });
}

// 工具函數
function formatChartDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatChartHour(dateStr) {
    const date = new Date(dateStr);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function generateColors(count) {
    const colors = [
        '#4a9eff', '#f87171', '#4ade80', '#fbbf24',
        '#a78bfa', '#fb7185', '#34d399', '#60a5fa'
    ];
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
}

// 監聽統計期間變更
document.addEventListener('DOMContentLoaded', () => {
    const statsPeriod = document.getElementById('statsPeriod');
    const statsDate = document.getElementById('statsDate');
    
    if (statsPeriod) {
        statsPeriod.addEventListener('change', loadStats);
    }
    
    if (statsDate) {
        statsDate.addEventListener('change', loadStats);
    }
});

