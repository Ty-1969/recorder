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
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterRecords);
    }
    
    // 視圖切換
    document.getElementById('statsBtn').addEventListener('click', toggleStatsView);
    document.getElementById('categoriesBtn').addEventListener('click', toggleCategoriesView);
    document.getElementById('exportBtn').addEventListener('click', showExportOptions);
    document.getElementById('settingsBtn').addEventListener('click', showSettings);
    
    // 統計期間變更
    const statsPeriod = document.getElementById('statsPeriod');
    if (statsPeriod) {
        statsPeriod.addEventListener('change', loadStats);
    }
    
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
let isLoadingCategories = false;
async function loadCategories() {
    // 防止重複載入
    if (isLoadingCategories) return;
    isLoadingCategories = true;
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success && data.categories) {
            // 過濾掉重複的類別（使用 Map 來去重）
            const uniqueCategories = [];
            const seenIds = new Set();
            
            data.categories.forEach(cat => {
                if (cat && cat.id && !seenIds.has(cat.id)) {
                    seenIds.add(cat.id);
                    uniqueCategories.push(cat);
                }
            });
            
            categories = uniqueCategories;
            populateCategorySelects();
        }
    } catch (error) {
        console.error('載入類別失敗:', error);
    } finally {
        isLoadingCategories = false;
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
        // 使用本地日期格式，避免時區問題
        const startDate = formatDateLocal(getWeekStart(currentDate));
        const endDate = formatDateLocal(getWeekEnd(currentDate));
        
        console.log('載入紀錄:', { 
            currentDate: formatDateLocal(currentDate),
            startDate, 
            endDate,
            weekStartDay: getWeekStart(currentDate).getDay(),
            weekEndDay: getWeekEnd(currentDate).getDay()
        }); // 除錯用
        
        const response = await fetch(
            `${API_BASE}/records?start_date=${startDate}&end_date=${endDate}`,
            {
                headers: { 'Authorization': `Bearer ${token}` }
            }
        );
        
        const data = await response.json();
        console.log('紀錄回應:', data); // 除錯用
        
        if (data.success) {
            records = data.records || [];
            console.log('載入的紀錄數量:', records.length); // 除錯用
            renderRecords();
        } else {
            console.error('載入紀錄失敗:', data.error);
            alert('載入紀錄失敗: ' + (data.error || '未知錯誤'));
        }
    } catch (error) {
        console.error('載入紀錄錯誤:', error);
        alert('載入紀錄失敗: ' + error.message);
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
            // 使用本地日期格式
            const dateKey = formatDateLocal(date);
            dayColumns[index].setAttribute('data-date', dateKey);
            dayColumns[index].innerHTML = '';
            
            // 過濾該日期的紀錄（考慮類別篩選）
            const categoryFilter = document.getElementById('categoryFilter')?.value;
            let dayRecords = records.filter(r => {
                // 確保日期格式一致
                const recordDate = r.record_date ? r.record_date.split('T')[0] : r.record_date;
                return recordDate === dateKey;
            });
            
            if (categoryFilter && categoryFilter !== '') {
                dayRecords = dayRecords.filter(r => r.category_id == categoryFilter);
            }
            
            dayRecords.forEach(record => {
                dayColumns[index].appendChild(createRecordCard(record));
            });
        }
    });
}

function renderDayView() {
    // 使用本地日期格式
    const dateKey = formatDateLocal(currentDate);
    let dayRecords = records.filter(r => {
        // 確保日期格式一致
        const recordDate = r.record_date ? r.record_date.split('T')[0] : r.record_date;
        return recordDate === dateKey;
    });
    
    // 考慮類別篩選
    const categoryFilter = document.getElementById('categoryFilter')?.value;
    if (categoryFilter && categoryFilter !== '') {
        dayRecords = dayRecords.filter(r => r.category_id == categoryFilter);
    }
    
    const container = document.getElementById('dayRecords');
    container.innerHTML = '';
    
    if (dayRecords.length === 0) {
        const dateStr = formatDate(dateKey);
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">${dateStr} 還沒有紀錄</div>
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
    const datePicker = document.getElementById('datePicker');
    if (datePicker) {
        // 使用本地日期格式，避免時區問題
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        datePicker.value = `${year}-${month}-${day}`;
    }
}

function getWeekStart(date) {
    // 複製日期物件，避免修改原始日期
    const d = new Date(date);
    // 取得星期幾（0 = 週日, 1 = 週一, ...）
    const day = d.getDay();
    // 計算到本週週日的天數差
    const diff = d.getDate() - day;
    // 建立新日期物件，設定為本週週日
    const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
    return weekStart;
}

function getWeekEnd(date) {
    const start = getWeekStart(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return end;
}

// 格式化日期為 YYYY-MM-DD（本地時間）
function formatDateLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 新增/編輯紀錄
function showAddRecordModal() {
    editingRecordId = null;
    document.getElementById('recordModalTitle').textContent = '新增紀錄';
    document.getElementById('recordForm').reset();
    // 使用本地日期格式，避免時區問題
    document.getElementById('recordDate').value = formatDateLocal(currentDate);
    document.getElementById('recordTime').value = new Date().toTimeString().substring(0, 5);
    document.getElementById('recordFields').innerHTML = '';
    document.getElementById('recordModal').classList.add('active');
}

async function loadCategoryFields() {
    const categoryId = document.getElementById('recordCategory').value;
    if (!categoryId) {
        document.getElementById('recordFields').innerHTML = '';
        // 顯示固定的備註欄位
        const notesGroup = document.querySelector('#recordNotes').closest('.form-group');
        if (notesGroup) notesGroup.style.display = '';
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE}/categories/${categoryId}/fields`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (data.success) {
            // 檢查是否有 notes 欄位
            const hasNotesField = data.fields.some(field => field.field_name === 'notes');
            // 如果有 notes 欄位，隱藏固定的備註欄位
            const notesGroup = document.querySelector('#recordNotes').closest('.form-group');
            if (notesGroup) {
                notesGroup.style.display = hasNotesField ? 'none' : '';
            }
            renderFields(data.fields);
        }
    } catch (error) {
        console.error('載入欄位失敗:', error);
    }
}

function renderFields(fields) {
    const container = document.getElementById('recordFields');
    container.innerHTML = '';
    
    if (!fields || !Array.isArray(fields) || fields.length === 0) {
        console.warn('[renderFields] 沒有欄位資料');
        return;
    }
    
    // 調試：記錄原始資料
    console.log('[renderFields] 收到欄位數量:', fields.length);
    const originalFieldNames = fields.map(f => f.field_name);
    const originalDuplicates = originalFieldNames.filter((name, index) => originalFieldNames.indexOf(name) !== index);
    if (originalDuplicates.length > 0) {
        console.warn('[renderFields] 後端返回的重複欄位:', originalDuplicates);
    }
    
    // 前端去重：根據 field_name 去重，確保每個 field_name 只保留一個
    // 使用 Map 確保每個 field_name 只保留一個，優先保留 display_order 較小的
    const fieldsMap = new Map();
    
    fields.forEach((field, index) => {
        if (!field || !field.field_name) {
            console.warn('[renderFields] 跳過無效欄位:', field);
            return;
        }
        
        const fieldName = field.field_name;
        
        // 如果 Map 中還沒有這個欄位名稱，直接加入
        if (!fieldsMap.has(fieldName)) {
            fieldsMap.set(fieldName, { ...field, _index: index });
        } else {
            // 如果已存在，比較並決定是否替換
            const existing = fieldsMap.get(fieldName);
            let shouldReplace = false;
            
            // 優先比較 display_order（較小者優先）
            if (field.display_order < existing.display_order) {
                shouldReplace = true;
            } else if (field.display_order === existing.display_order) {
                // display_order 相同時，比較 id（較小者優先）
                if (field.id && existing.id) {
                    shouldReplace = field.id < existing.id;
                } else if (field.id && !existing.id) {
                    shouldReplace = true; // 有 id 的優先於沒有 id 的
                } else {
                    // 都沒有 id 時，保留第一個遇到的（不替換）
                    shouldReplace = false;
                }
            }
            
            if (shouldReplace) {
                console.log(`[renderFields] 替換欄位 ${fieldName}: 舊 display_order=${existing.display_order}, 新 display_order=${field.display_order}`);
                fieldsMap.set(fieldName, { ...field, _index: index });
            } else {
                console.log(`[renderFields] 跳過重複欄位 ${fieldName} (索引: ${index}), 保留已存在的`);
            }
        }
    });
    
    // 轉換回陣列並排序，移除臨時的 _index 屬性
    const uniqueFields = Array.from(fieldsMap.values())
        .map(field => {
            const { _index, ...rest } = field;
            return rest;
        })
        .sort((a, b) => {
            // 先按 display_order 排序
            if (a.display_order !== b.display_order) {
                return a.display_order - b.display_order;
            }
            // display_order 相同時，按 id 排序
            if (a.id && b.id) {
                return a.id - b.id;
            }
            return 0;
        });
    
    // 調試：確認去重後的結果
    console.log('[renderFields] 去重後的欄位數量:', uniqueFields.length);
    const finalFieldNames = uniqueFields.map(f => f.field_name);
    const finalDuplicates = finalFieldNames.filter((name, index) => finalFieldNames.indexOf(name) !== index);
    if (finalDuplicates.length > 0) {
        console.error('[renderFields] 去重後仍有重複欄位:', finalDuplicates);
    }
    
    uniqueFields.forEach(field => {
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
        } else if (field.field_type === 'text' && field.field_name === 'notes') {
            // notes 欄位使用 textarea
            input = document.createElement('textarea');
            input.className = 'form-input';
            input.rows = 3;
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
    
    // 直接從 DOM 元素取得值
    const timeInput = document.getElementById('recordTime');
    const recordTime = timeInput ? (timeInput.value || null) : null;
    
    const data = {};
    // 包含 input, select 和 textarea
    const fields = document.querySelectorAll('#recordFields input, #recordFields select, #recordFields textarea');
    let notes = null;
    
    fields.forEach(field => {
        if (field.name === 'notes') {
            // 如果動態欄位中有 notes，優先使用
            if (field.value && field.value.trim() !== '') {
                notes = field.value.trim();
            }
        } else if (field.value && field.value.trim() !== '') {
            data[field.name] = field.value;
        }
    });
    
    // 如果動態欄位中沒有 notes，使用固定的備註欄位
    if (!notes) {
        const notesInput = document.getElementById('recordNotes');
        notes = notesInput && notesInput.value && notesInput.value.trim() !== '' 
            ? notesInput.value.trim() 
            : null;
    }
    
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
    
    // 暫時移除 change 事件監聽器，避免觸發重複載入
    const categorySelect = document.getElementById('recordCategory');
    const changeHandler = loadCategoryFields;
    categorySelect.removeEventListener('change', changeHandler);
    
    categorySelect.value = record.category_id;
    document.getElementById('recordDate').value = record.record_date;
    document.getElementById('recordTime').value = record.record_time || '';
    
    await loadCategoryFields();
    
    // 重新添加事件監聽器
    categorySelect.addEventListener('change', changeHandler);
    
    // 填入現有資料
    setTimeout(() => {
        if (record.data) {
            Object.entries(record.data).forEach(([key, value]) => {
                const field = document.querySelector(`[name="${key}"]`);
                if (field) field.value = value;
            });
        }
        
        // 處理 notes 欄位：如果動態欄位中有 notes，填入動態欄位；否則填入固定欄位
        const notesField = document.querySelector('#recordFields [name="notes"]');
        const notesInput = document.getElementById('recordNotes');
        if (notesField) {
            // 如果有動態 notes 欄位，優先使用
            notesField.value = record.notes || '';
            if (notesInput) notesInput.value = '';
        } else if (notesInput) {
            // 如果沒有動態 notes 欄位，使用固定的備註欄位
            notesInput.value = record.notes || '';
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
    const categoryFilter = document.getElementById('categoryFilter');
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    console.log('篩選紀錄，選擇的類別:', selectedCategory, '當前紀錄數量:', records.length);
    renderRecords();
}

// 返回紀錄畫面
function backToRecords() {
    document.getElementById('statsView').style.display = 'none';
    document.getElementById('categoriesView').style.display = 'none';
    
    // 設定為今日並載入今日的所有紀錄
    currentDate = new Date();
    updateDatePicker();
    loadRecords();
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

// 設定功能
function showSettings() {
    const username = localStorage.getItem('username') || '未知';
    const settings = `目前使用者：${username}

功能說明：
• 點擊「+ 新增紀錄」來新增健康紀錄
• 點擊「📋」來管理類別
• 點擊「📊」來查看統計圖表
• 點擊「📤」來匯出資料
• 點擊「🚪」來登出

提示：
• 桌面版顯示週視圖
• 手機版顯示日視圖
• 可以編輯和刪除自己的紀錄`;
    alert(settings);
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
    
    // 過濾掉重複的類別
    const uniqueCategories = [];
    const seenIds = new Set();
    
    categoriesList.forEach(cat => {
        if (cat && cat.id && !seenIds.has(cat.id)) {
            seenIds.add(cat.id);
            uniqueCategories.push(cat);
        }
    });
    
    container.innerHTML = uniqueCategories.map(cat => `
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

