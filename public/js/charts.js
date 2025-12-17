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
        
        // 先載入類別列表（確保有最新的類別資料）
        if (!categories || categories.length === 0) {
            await loadCategories();
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

// 渲染所有圖表（動態顯示未隱藏的類別）
function renderCharts(stats, isSingleDay = false) {
    const container = document.getElementById('chartsContainer');
    if (!container) return;
    
    // 過濾掉隱藏的類別
    const visibleCategories = categories.filter(cat => !cat.is_hidden);
    
    // 清空容器並銷毀現有圖表
    Object.keys(charts).forEach(key => {
        if (charts[key]) {
            charts[key].destroy();
            charts[key] = null;
        }
    });
    container.innerHTML = '';
    
    // 使用新的統計數據結構（stats.categories）或舊的結構（向後兼容）
    const categoryStats = stats.categories || {};
    
    // 根據類別動態生成圖表
    visibleCategories.forEach(cat => {
        const categoryName = cat.name;
        const categoryId = cat.id;
        const categoryStat = categoryStats[categoryId];
        
        // 如果有新的統計數據結構，使用它
        if (categoryStat && categoryStat.data && categoryStat.data.length > 0) {
            const chartId = `chart_${categoryId}`;
            const chartCard = createChartCard(chartId, `${categoryName}統計`, categoryId, categoryStat);
            container.appendChild(chartCard);
            
            if (categoryStat.type === 'line') {
                // 線圖（用於血壓、心跳等數值趨勢）
                if (categoryName === '血壓') {
                    renderBPChart(categoryStat.data, isSingleDay, chartId);
                } else if (categoryName === '心跳') {
                    renderHRChart(categoryStat.data, isSingleDay, chartId);
                } else {
                    renderGenericLineChart(categoryStat.data, categoryName, chartId, isSingleDay);
                }
            } else if (categoryStat.type === 'pie') {
                // 圓餅圖（用於飲食等分類統計）
                renderGenericPieChart(categoryStat.data, categoryName, chartId);
            } else {
                // 長條圖（用於藥物、其他類別等）
                renderGenericBarChart(categoryStat.data, categoryName, chartId, categoryStat);
            }
        } else {
            // 向後兼容：使用舊的統計數據結構
            if (categoryName === '血壓' && stats.blood_pressure && stats.blood_pressure.length > 0) {
                const chartCard = createChartCard('bpChart', '血壓趨勢', categoryId);
                container.appendChild(chartCard);
                renderBPChart(stats.blood_pressure, isSingleDay);
            } else if (categoryName === '心跳' && stats.heart_rate && stats.heart_rate.length > 0) {
                const chartCard = createChartCard('hrChart', '心跳趨勢', categoryId);
                container.appendChild(chartCard);
                renderHRChart(stats.heart_rate, isSingleDay);
            } else if (categoryName === '飲食' && stats.diet && stats.diet.length > 0) {
                const chartCard = createChartCard('dietChart', '飲食統計', categoryId);
                container.appendChild(chartCard);
                renderDietChart(stats.diet);
            } else if (categoryName === '藥物' && stats.medication && stats.medication.length > 0) {
                const chartCard = createChartCard('medChart', '藥物使用', categoryId);
                container.appendChild(chartCard);
                renderMedChart(stats.medication);
            }
        }
    });
}

// 創建圖表卡片
function createChartCard(chartId, title, categoryId, categoryStat = null) {
    const card = document.createElement('div');
    card.className = 'chart-card';
    card.dataset.categoryId = categoryId;
    
    // 如果有總計（大號、小號），在標題旁邊顯示
    let titleHtml = `<h3 style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">`;
    titleHtml += `<span>${title}</span>`;
    
    if (categoryStat && categoryStat.total !== undefined) {
        titleHtml += `<span style="color: #b0b0b0; font-size: 0.9rem; font-weight: normal;">
            總計: <strong style="color: #fff;">${categoryStat.total}${categoryStat.unit || ''}</strong>
            ${categoryStat.count !== undefined ? ` | 次數: <strong style="color: #fff;">${categoryStat.count}次</strong>` : ''}
        </span>`;
    }
    
    titleHtml += `</h3>`;
    titleHtml += `<canvas id="${chartId}"></canvas>`;
    
    card.innerHTML = titleHtml;
    return card;
}

// 血壓趨勢圖
function renderBPChart(data, isSingleDay = false, chartId = 'bpChart') {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
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
        chartCard.innerHTML = '<h3>血壓趨勢</h3><canvas id="' + chartId + '"></canvas>';
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => isSingleDay ? formatChartHour(d.date) : formatChartDate(d.date));
    const systolic = data.map(d => d.systolic);
    const diastolic = data.map(d => d.diastolic);
    const heartRate = data.map(d => d.heart_rate || null);
    
    // 檢查是否有心跳數據
    const hasHeartRate = heartRate.some(hr => hr !== null && hr > 0);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
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
    
    charts[chartKey] = new Chart(ctx, {
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
function renderHRChart(data, isSingleDay = false, chartId = 'hrChart') {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
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
        chartCard.innerHTML = '<h3>心跳趨勢</h3><canvas id="' + chartId + '"></canvas>';
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => isSingleDay ? formatChartHour(d.date) : formatChartDate(d.date));
    const values = data.map(d => d.heart_rate);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
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
function renderDietChart(data, chartId = 'dietChart') {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
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
        chartCard.innerHTML = '<h3>飲食統計</h3><canvas id="' + chartId + '"></canvas>';
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    const colors = generateColors(labels.length);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
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
function renderMedChart(data, chartId = 'medChart') {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
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
        chartCard.innerHTML = '<h3>藥物使用</h3><canvas id="' + chartId + '"></canvas>';
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
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

// 通用長條圖（用於其他類別）
function renderGenericBarChart(data, categoryName, chartId, categoryStat = null) {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
    if (!chartCard) return;
    
    if (!data || data.length === 0) {
        const chartKey = chartId;
        if (charts[chartKey]) {
            charts[chartKey].destroy();
            charts[chartKey] = null;
        }
        chartCard.innerHTML = `<h3>${categoryName}統計</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無${categoryName}紀錄</div>`;
        return;
    }
    
    // 檢查 canvas 是否存在，如果不存在則創建
    if (!chartCard.querySelector('canvas')) {
        // 如果標題已經包含總計信息（由 createChartCard 創建），就不需要重新創建
        // 否則創建標題和 canvas
        const existingTitle = chartCard.querySelector('h3');
        if (!existingTitle) {
            // 構建標題，總計顯示在標題旁邊
            let titleHtml = `<h3 style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">`;
            titleHtml += `<span>${categoryName}統計</span>`;
            
            // 如果有總計（大號、小號），在標題旁邊顯示
            if (categoryStat && categoryStat.total !== undefined) {
                titleHtml += `<span style="color: #b0b0b0; font-size: 0.9rem; font-weight: normal;">
                    總計: <strong style="color: #fff;">${categoryStat.total}${categoryStat.unit || ''}</strong>
                    ${categoryStat.count !== undefined ? ` | 次數: <strong style="color: #fff;">${categoryStat.count}次</strong>` : ''}
                </span>`;
            }
            
            titleHtml += `</h3>`;
            titleHtml += `<canvas id="${chartId}"></canvas>`;
            chartCard.innerHTML = titleHtml;
        } else {
            // 標題已存在，只添加 canvas
            const canvas = document.createElement('canvas');
            canvas.id = chartId;
            chartCard.appendChild(canvas);
        }
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    const colors = generateColors(labels.length);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: categoryStat && categoryStat.unit ? categoryStat.unit : '次數',
                data: values,
                backgroundColor: colors,
                borderColor: colors.map(c => c.replace('0.8', '1')),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.dataset.label || '';
                            const value = context.parsed.y;
                            return `${label}: ${value}`;
                        }
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
                    beginAtZero: true
                }
            }
        }
    });
}

// 通用圓餅圖（用於其他類別）
function renderGenericPieChart(data, categoryName, chartId) {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
    if (!chartCard) return;
    
    if (!data || data.length === 0) {
        const chartKey = chartId;
        if (charts[chartKey]) {
            charts[chartKey].destroy();
            charts[chartKey] = null;
        }
        chartCard.innerHTML = `<h3>${categoryName}統計</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無${categoryName}紀錄</div>`;
        return;
    }
    
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = `<h3>${categoryName}統計</h3><canvas id="${chartId}"></canvas>`;
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => d.name);
    const values = data.map(d => d.count);
    const colors = generateColors(labels.length);
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
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

// 通用線圖（用於其他類別）
function renderGenericLineChart(data, categoryName, chartId, isSingleDay = false) {
    const chartCard = document.querySelector(`#${chartId}`)?.parentElement;
    if (!chartCard) return;
    
    if (!data || data.length === 0) {
        const chartKey = chartId;
        if (charts[chartKey]) {
            charts[chartKey].destroy();
            charts[chartKey] = null;
        }
        chartCard.innerHTML = `<h3>${categoryName}統計</h3><div style="padding: 20px; text-align: center; color: #707070;">尚無${categoryName}紀錄</div>`;
        return;
    }
    
    if (!chartCard.querySelector('canvas')) {
        chartCard.innerHTML = `<h3>${categoryName}統計</h3><canvas id="${chartId}"></canvas>`;
    }
    
    const ctx = document.getElementById(chartId);
    if (!ctx) return;
    
    const labels = data.map(d => isSingleDay ? formatChartHour(d.date) : formatChartDate(d.date));
    const values = data.map(d => {
        // 嘗試取得數值，如果沒有則使用第一個可用的數值
        const keys = Object.keys(d).filter(k => k !== 'date');
        return keys.length > 0 ? parseFloat(d[keys[0]]) || 0 : 0;
    });
    
    const chartKey = chartId;
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    charts[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: categoryName,
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
                    display: true,
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

