// 圖表功能
let charts = {};

// 載入統計資料
async function loadStats() {
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const period = document.getElementById('statsPeriod').value || '7';
        
        const response = await fetch(`${API_BASE}/records/stats?period=${period}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderCharts(data.stats);
        }
    } catch (error) {
        console.error('載入統計失敗:', error);
    } finally {
        hideLoading();
    }
}

// 渲染所有圖表
function renderCharts(stats) {
    renderBPChart(stats.blood_pressure || []);
    renderHRChart(stats.heart_rate || []);
    renderDietChart(stats.diet || []);
    renderMedChart(stats.medication || []);
}

// 血壓趨勢圖
function renderBPChart(data) {
    const ctx = document.getElementById('bpChart');
    if (!ctx) return;
    
    const labels = data.map(d => formatChartDate(d.date));
    const systolic = data.map(d => d.systolic);
    const diastolic = data.map(d => d.diastolic);
    
    if (charts.bp) {
        charts.bp.destroy();
    }
    
    charts.bp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '收縮壓',
                    data: systolic,
                    borderColor: '#f87171',
                    backgroundColor: 'rgba(248, 113, 113, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: '舒張壓',
                    data: diastolic,
                    borderColor: '#4ade80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
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
                        text: 'mmHg',
                        color: '#b0b0b0'
                    }
                }
            }
        }
    });
}

// 心跳趨勢圖
function renderHRChart(data) {
    const ctx = document.getElementById('hrChart');
    if (!ctx) return;
    
    const labels = data.map(d => formatChartDate(d.date));
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
    if (statsPeriod) {
        statsPeriod.addEventListener('change', loadStats);
    }
});

