// 健康紀錄系統 - 主要應用邏輯
const API_BASE = '/.netlify/functions';

// 全域狀態
let currentUser = null;
let currentDate = new Date();
let currentView = 'week'; // 'week' or 'day'
let categories = [];
let records = [];
let editingRecordId = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
    setupResponsiveView();
});

// 檢查認證狀態
async function checkAuth() {
    const token = localStorage.getItem('auth_token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        showAuthModal();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showApp();
            await loadCategories();
            await loadRecords();
        } else {
            throw new Error('認證失敗');
        }
    } catch (error) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        showAuthModal();
    }
}

// 顯示登入模態框
function showAuthModal() {
    document.getElementById('authModal').classList.add('active');
    document.getElementById('app').style.display = 'none';
}

// 顯示應用程式
function showApp() {
    document.getElementById('authModal').classList.remove('active');
    document.getElementById('app').style.display = 'flex';
    updateDatePicker();
}

// 設定事件監聽器
function setupEventListeners() {
    // 認證相關
    document.getElementById('authForm').addEventListener('submit', handleAuth);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // 紀錄相關
    document.getElementById('addRecordBtn').addEventListener('click', showAddRecordModal);
    document.getElementById('closeRecordModal').addEventListener('click', closeRecordModal);
    document.getElementById('cancelRecordBtn').addEventListener('click', closeRecordModal);
    document.getElementById('recordForm').addEventListener('submit', handleSaveRecord);
    document.getElementById('recordCategory').addEventListener('change', loadCategoryFields);
    
    // 日期導航
    document.getElementById('prevWeekBtn').addEventListener('click', () => navigateDate(-7));
    document.getElementById('nextWeekBtn').addEventListener('click', () => navigateDate(7));
    document.getElementById('todayBtn').addEventListener('click', goToToday);
    document.getElementById('datePicker').addEventListener('change', handleDateChange);
    
    // 篩選
    document.getElementById('categoryFilter').addEventListener('change', filterRecords);
    
    // 視圖切換
    document.getElementById('statsBtn').addEventListener('click', toggleStatsView);
    document.getElementById('categoriesBtn').addEventListener('click', toggleCategoriesView);
    document.getElementById('exportBtn').addEventListener('click', showExportOptions);
    
    // 類別管理
    document.getElementById('closeCategoryModal').addEventListener('click', closeCategoryModal);
    document.getElementById('cancelCategoryBtn').addEventListener('click', closeCategoryModal);
    document.getElementById('categoryForm').addEventListener('submit', handleSaveCategory);
}

// 設定響應式視圖
function setupResponsiveView() {
    const updateView = () => {
        const isMobile = window.innerWidth < 768;
        currentView = isMobile ? 'day' : 'week';
        
        if (isMobile) {
            document.getElementById('weekView').style.display = 'none';
            document.getElementById('dayView').style.display = 'block';
        } else {
            document.getElementById('weekView').style.display = 'block';
            document.getElementById('dayView').style.display = 'none';
        }
        
        renderRecords();
    };
    
    window.addEventListener('resize', updateView);
    updateView();
}

// 認證處理
async function handleAuth(e) {
    e.preventDefault();
    showLoading();
    
    const username = document.getElementById('authUsername').value.trim();
    
    if (!username) {
        alert('請輸入使用者名稱');
        hideLoading();
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        
        const data = await response.json();
        
        if (data.success) {
            localStorage.setItem('auth_token', data.token);
            localStorage.setItem('username', username);
            currentUser = data.user;
            showApp();
            await loadCategories();
            await loadRecords();
        } else {
            alert(data.error || '登入失敗');
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    if (confirm('確定要登出嗎？')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        currentUser = null;
        records = [];
        categories = [];
        showAuthModal();
    }
}

// 載入類別
async function loadCategories() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            categories = data.categories;
            populateCategorySelects();
        }
    } catch (error) {
        console.error('載入類別失敗:', error);
    }
}

function populateCategorySelects() {
    const categorySelect = document.getElementById('recordCategory');
    const filterSelect = document.getElementById('categoryFilter');
    
    if (!categorySelect || !filterSelect) return;
    
    // 清空選項
    categorySelect.innerHTML = '<option value="">請選擇類別</option>';
    filterSelect.innerHTML = '<option value="">全部類別</option>';
    
    // 過濾掉重複的類別（使用 Map 來去重）
    const uniqueCategories = new Map();
    categories.forEach(cat => {
        if (cat && cat.id && !uniqueCategories.has(cat.id)) {
            uniqueCategories.set(cat.id, cat);
        }
    });
    
    // 添加唯一類別
    uniqueCategories.forEach(cat => {
        const option1 = document.createElement('option');
        option1.value = cat.id;
        option1.textContent = `${cat.icon || '📝'} ${cat.name}`;
        categorySelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = cat.id;
        option2.textContent = `${cat.icon || '📝'} ${cat.name}`;
        filterSelect.appendChild(option2);
    });
}

// 載入紀錄
async function loadRecords() {
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const startDate = getWeekStart(currentDate).toISOString().split('T')[0];
        const endDate = getWeekEnd(currentDate).toISOString().split('T')[0];
        
        const response = await fetch(
            `${API_BASE}/records?start_date=${startDate}&end_date=${endDate}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        
        const data = await response.json();
        if (data.success) {
            records = data.records;
            renderRecords();
        }
    } catch (error) {
        console.error('載入紀錄失敗:', error);
        alert('載入紀錄失敗');
    } finally {
        hideLoading();
    }
}

// 渲染紀錄
function renderRecords() {
    if (currentView === 'week') {
        renderWeekView();
    } else {
        renderDayView();
    }
}

function renderWeekView() {
    const weekStart = getWeekStart(currentDate);
    const weekDays = [];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        weekDays.push(date);
    }
    
    // 更新週標題
    const dayHeaders = document.querySelectorAll('.day-header');
    const dayColumns = document.querySelectorAll('.day-column');
    
    weekDays.forEach((date, index) => {
        const dayName = ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        
        if (dayHeaders[index]) {
            dayHeaders[index].querySelector('.day-name').textContent = dayName;
            dayHeaders[index].querySelector('.day-date').textContent = dateStr;
        }
        
        if (dayColumns[index]) {
            const dateKey = date.toISOString().split('T')[0];
            dayColumns[index].setAttribute('data-date', dateKey);
            dayColumns[index].innerHTML = '';
            
            const dayRecords = records.filter(r => r.record_date === dateKey);
            dayRecords.forEach(record => {
                dayColumns[index].appendChild(createRecordCard(record));
            });
        }
    });
}

function renderDayView() {
    const dateKey = currentDate.toISOString().split('T')[0];
    const dayRecords = records.filter(r => r.record_date === dateKey);
    const container = document.getElementById('dayRecords');
    
    container.innerHTML = '';
    
    if (dayRecords.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">今天還沒有紀錄</div>
            </div>
        `;
    } else {
        dayRecords.forEach(record => {
            container.appendChild(createRecordCard(record));
        });
    }
}

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.dataset.recordId = record.id;
    
    const category = categories.find(c => c.id === record.category_id);
    const categoryName = category ? category.name : '未知';
    const categoryIcon = category ? category.icon : '📝';
    
    const timeStr = record.record_time ? ` ${record.record_time.substring(0, 5)}` : '';
    
    let dataHtml = '';
    if (record.data && typeof record.data === 'object') {
        Object.entries(record.data).forEach(([key, value]) => {
            if (value !== null && value !== '') {
                dataHtml += `
                    <div class="record-field">
                        <span class="record-field-label">${key}:</span>
                        <span class="record-field-value">${value}</span>
                    </div>
                `;
            }
        });
    }
    
    card.innerHTML = `
        <div class="record-card-header">
            <div class="record-category">
                <span>${categoryIcon}</span>
                <span>${categoryName}</span>
            </div>
            <div class="record-time">${formatDate(record.record_date)}${timeStr}</div>
            <div class="record-actions">
                <button class="record-action-btn" onclick="editRecord(${record.id})">✏️</button>
                <button class="record-action-btn" onclick="deleteRecord(${record.id})">🗑️</button>
            </div>
        </div>
        <div class="record-data">
            ${dataHtml || '<div class="record-field">無資料</div>'}
        </div>
        ${record.notes ? `<div class="record-notes">${escapeHtml(record.notes)}</div>` : ''}
    `;
    
    return card;
}

// 日期導航
function navigateDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDatePicker();
    loadRecords();
}

function goToToday() {
    currentDate = new Date();
    updateDatePicker();
    loadRecords();
}

function handleDateChange(e) {
    currentDate = new Date(e.target.value);
    loadRecords();
}

function updateDatePicker() {
    document.getElementById('datePicker').value = currentDate.toISOString().split('T')[0];
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
}

function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
}

// 新增/編輯紀錄
function showAddRecordModal() {
    editingRecordId = null;
    document.getElementById('recordModalTitle').textContent = '新增紀錄';
    document.getElementById('recordForm').reset();
    document.getElementById('recordDate').value = currentDate.toISOString().split('T')[0];
    document.getElementById('recordTime').value = new Date().toTimeString().substring(0, 5);
    document.getElementById('recordFields').innerHTML = '';
    document.getElementById('recordModal').classList.add('active');
}

async function loadCategoryFields() {
    const categoryId = document.getElementById('recordCategory').value;
    if (!categoryId) {
        document.getElementById('recordFields').innerHTML = '';
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories/${categoryId}/fields`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderFields(data.fields);
        }
    } catch (error) {
        console.error('載入欄位失敗:', error);
    }
}

function renderFields(fields) {
    const container = document.getElementById('recordFields');
    container.innerHTML = '';
    
    fields.forEach(field => {
        const group = document.createElement('div');
        group.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = field.field_label + (field.is_required ? ' *' : '');
        
        let input;
        if (field.field_type === 'select' && field.field_options) {
            input = document.createElement('select');
            input.className = 'form-input';
            if (!field.is_required) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '請選擇';
                input.appendChild(emptyOption);
            }
            field.field_options.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                input.appendChild(opt);
            });
        } else if (field.field_type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.className = 'form-input';
        } else {
            input = document.createElement('input');
            input.type = field.field_type === 'date' ? 'date' : field.field_type === 'time' ? 'time' : 'text';
            input.className = 'form-input';
        }
        
        input.name = field.field_name;
        input.required = field.is_required;
        if (field.unit) {
            input.placeholder = `單位：${field.unit}`;
        }
        
        group.appendChild(label);
        group.appendChild(input);
        container.appendChild(group);
    });
}

async function handleSaveRecord(e) {
    e.preventDefault();
    
    // 直接從 select 元素取得值，而不是從 FormData
    const categorySelect = document.getElementById('recordCategory');
    const dateInput = document.getElementById('recordDate');
    
    const categoryId = categorySelect ? categorySelect.value : '';
    const recordDate = dateInput ? dateInput.value : '';
    
    // 驗證必填欄位
    if (!categoryId || categoryId === '' || categoryId === '0') {
        alert('請選擇類別');
        if (categorySelect) categorySelect.focus();
        return;
    }
    
    if (!recordDate || recordDate === '') {
        alert('請選擇日期');
        if (dateInput) dateInput.focus();
        return;
    }
    
    // 驗證 categoryId 是否為有效數字
    const categoryIdNum = parseInt(categoryId);
    if (isNaN(categoryIdNum) || categoryIdNum <= 0) {
        alert('請選擇有效的類別');
        if (categorySelect) categorySelect.focus();
        return;
    }
    
    showLoading();
    
    const recordTime = formData.get('recordTime') || null;
    const notes = formData.get('recordNotes') || null;
    
    const data = {};
    const fields = document.querySelectorAll('#recordFields input, #recordFields select');
    fields.forEach(field => {
        if (field.value && field.value.trim() !== '') {
            data[field.name] = field.value;
        }
    });
    
    try {
        const token = localStorage.getItem('auth_token');
        const url = editingRecordId 
            ? `${API_BASE}/records/${editingRecordId}`
            : `${API_BASE}/records`;
        
        const requestBody = {
            category_id: categoryIdNum,
            record_date: recordDate,
            record_time: recordTime || null,
            notes: notes || null,
            data: data
        };
        
        console.log('發送請求:', requestBody); // 除錯用
        
        const response = await fetch(url, {
            method: editingRecordId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestBody)
        });
        
        const result = await response.json();
        console.log('回應結果:', result); // 除錯用
        
        if (result.success) {
            closeRecordModal();
            await loadRecords();
        } else {
            alert(result.error || '儲存失敗：' + JSON.stringify(result));
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

function closeRecordModal() {
    document.getElementById('recordModal').classList.remove('active');
    editingRecordId = null;
}

async function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    editingRecordId = id;
    document.getElementById('recordModalTitle').textContent = '編輯紀錄';
    document.getElementById('recordCategory').value = record.category_id;
    document.getElementById('recordDate').value = record.record_date;
    document.getElementById('recordTime').value = record.record_time || '';
    document.getElementById('recordNotes').value = record.notes || '';
    
    await loadCategoryFields();
    
    // 填入現有資料
    setTimeout(() => {
        if (record.data) {
            Object.entries(record.data).forEach(([key, value]) => {
                const field = document.querySelector(`[name="${key}"]`);
                if (field) field.value = value;
            });
        }
    }, 300);
    
    document.getElementById('recordModal').classList.add('active');
}

async function deleteRecord(id) {
    if (!confirm('確定要刪除此紀錄嗎？')) return;
    
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/records/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            await loadRecords();
        } else {
            alert(data.error || '刪除失敗');
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

// 篩選
function filterRecords() {
    renderRecords();
}

// 返回紀錄畫面
function backToRecords() {
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('categoriesView').style.display = 'none';
    setupResponsiveView();
}

// 統計視圖
function toggleStatsView() {
    const statsView = document.getElementById('statsView');
    const categoriesView = document.getElementById('categoriesView');
    const weekView = document.getElementById('weekView');
    const dayView = document.getElementById('dayView');
    const isVisible = statsView.style.display !== 'none';
    
    if (!isVisible) {
        statsView.style.display = 'block';
        categoriesView.style.display = 'none';
        weekView.style.display = 'none';
        dayView.style.display = 'none';
        loadStats();
    } else {
        backToRecords();
    }
}

// 類別管理視圖
function toggleCategoriesView() {
    const statsView = document.getElementById('statsView');
    const categoriesView = document.getElementById('categoriesView');
    const weekView = document.getElementById('weekView');
    const dayView = document.getElementById('dayView');
    const isVisible = categoriesView.style.display !== 'none';
    
    if (!isVisible) {
        categoriesView.style.display = 'block';
        statsView.style.display = 'none';
        weekView.style.display = 'none';
        dayView.style.display = 'none';
        loadCategoriesList();
    } else {
        backToRecords();
    }
}

// 匯出
function showExportOptions() {
    const format = confirm('選擇匯出格式：\n確定 = PDF\n取消 = Excel') ? 'pdf' : 'excel';
    exportData(format);
}

// 工具函數
function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 類別管理功能
let editingCategoryId = null;

async function loadCategoriesList() {
    const container = document.getElementById('categoriesList');
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">載入中...</div></div>';
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            renderCategoriesList(data.categories);
        }
    } catch (error) {
        console.error('載入類別列表失敗:', error);
        container.innerHTML = '<div class="empty-state"><div class="empty-state-text">載入失敗</div></div>';
    }
}

function renderCategoriesList(categoriesList) {
    const container = document.getElementById('categoriesList');
    
    if (!categoriesList || categoriesList.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-text">還沒有類別</div></div>';
        return;
    }
    
    container.innerHTML = categoriesList.map(cat => `
        <div class="chart-card">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                    <span>${cat.icon || '📝'}</span>
                    <span>${escapeHtml(cat.name)}</span>
                </h3>
                ${!cat.is_default ? `
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.9rem;" onclick="editCategory(${cat.id})">編輯</button>
                        <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.9rem; background: var(--accent-danger);" onclick="deleteCategory(${cat.id})">刪除</button>
                    </div>
                ` : '<span style="font-size: 0.85rem; color: var(--text-muted);">預設類別</span>'}
            </div>
        </div>
    `).join('');
}

function showAddCategoryModal() {
    editingCategoryId = null;
    document.getElementById('categoryModalTitle').textContent = '新增類別';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryModal').classList.add('active');
}

function editCategory(id) {
    const category = categories.find(c => c.id === id);
    if (!category || category.is_default) return;
    
    editingCategoryId = id;
    document.getElementById('categoryModalTitle').textContent = '編輯類別';
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryIcon').value = category.icon || '';
    document.getElementById('categoryModal').classList.add('active');
}

async function handleSaveCategory(e) {
    e.preventDefault();
    showLoading();
    
    const name = document.getElementById('categoryName').value.trim();
    const icon = document.getElementById('categoryIcon').value.trim() || '📝';
    
    if (!name) {
        alert('請輸入類別名稱');
        hideLoading();
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const url = editingCategoryId 
            ? `${API_BASE}/categories/${editingCategoryId}`
            : `${API_BASE}/categories`;
        
        const response = await fetch(url, {
            method: editingCategoryId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name: name,
                icon: icon
            })
        });
        
        const result = await response.json();
        if (result.success) {
            closeCategoryModal();
            await loadCategories();
            await loadCategoriesList();
            populateCategorySelects();
        } else {
            alert(result.error || '儲存失敗');
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

async function deleteCategory(id) {
    const category = categories.find(c => c.id === id);
    if (!category || category.is_default) {
        alert('無法刪除預設類別');
        return;
    }
    
    if (!confirm(`確定要刪除類別「${category.name}」嗎？\n注意：刪除後相關的紀錄不會被刪除，但類別會顯示為「未知」。`)) {
        return;
    }
    
    showLoading();
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            await loadCategories();
            await loadCategoriesList();
            populateCategorySelects();
        } else {
            alert(data.error || '刪除失敗');
        }
    } catch (error) {
        alert('發生錯誤：' + error.message);
    } finally {
        hideLoading();
    }
}

function closeCategoryModal() {
    document.getElementById('categoryModal').classList.remove('active');
    editingCategoryId = null;
}

// 全域函數（供 HTML 呼叫）
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.backToRecords = backToRecords;
window.showAddCategoryModal = showAddCategoryModal;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

