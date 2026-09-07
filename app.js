const API_URL = 'https://script.google.com/macros/s/AKfycbxddjWQjjM2TP-kTquMjRZXVy8Ov244ykDnWjTfa6ccDK_QQwokBsAWbs6uq6MrLh2f/exec';

// ====== دوال مساعدة ======
function showToast(message, type = 'error') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3300);
}

function checkAuth() {
    const token = sessionStorage.getItem('authToken');
    if (!token && !window.location.href.includes('index.html')) {
        window.location.href = 'index.html';
    }
    return token;
}

// ====== منطق صفحة تسجيل الدخول (index.html) ======
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const loader = document.getElementById('loginLoader');

        if (!username || !password) { return showToast('يرجى إدخال البيانات', 'warning'); }

        btnText.style.display = 'none'; loader.style.display = 'block'; loginBtn.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'login', username, password })
            });
            const data = await response.json();

            if (data.success) {
                showToast('تم تسجيل الدخول بنجاح!', 'success');
                sessionStorage.setItem('authToken', data.data.token);
                sessionStorage.setItem('userRole', data.data.role);
                sessionStorage.setItem('username', data.data.username);
                setTimeout(() => window.location.href = 'dashboard.html', 1000);
            } else { showToast(data.error || 'خطأ في الدخول', 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; loginBtn.disabled = false; }
    });
}

// ====== منطق لوحة التحكم (dashboard.html) ======
if (document.getElementById('dashboardBody') || document.querySelector('.dashboard-body')) {
    const token = checkAuth();
    
    // تعبئة بيانات المستخدم في Topbar
    document.getElementById('displayUsername').innerText = sessionStorage.getItem('username') || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    // متغيرات الترقيم والبحث
    let currentPage = 1;
    let searchQuery = '';
    let searchTimeout;

    // دالة جلب الإعدادات (الفروع والتخصصات)
    async function fetchSettings() {
        try {
            const url = `${API_URL}?action=getSettings`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.success) {
                const branches = data.data.branches;
                const specialties = data.data.specialties;
                
                const branchSelect = document.getElementById('preferredBranch');
                branches.forEach(b => { branchSelect.innerHTML += `<option value="${b}">${b}</option>`; });
                
                const specialtySelect = document.getElementById('requiredSpecialty');
                specialties.forEach(s => { specialtySelect.innerHTML += `<option value="${s}">${s}</option>`; });
            }
        } catch (error) { console.error('Settings Error:', error); }
    }

    // دالة جلب العملاء
    async function fetchClients(page = 1, search = '') {
        try {
            const url = `${API_URL}?action=getClients&token=${token}&page=${page}&search=${encodeURIComponent(search)}`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                renderTable(data.data.clients, data.data.total, page);
            }
        } catch (error) { console.error('Fetch Clients Error:', error); }
    }

    // دالة رسم جدول العملاء
    function renderTable(clients, total, page) {
        const tbody = document.getElementById('clientsTableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';

        if (clients.length === 0) {
            emptyState.style.display = 'block';
            document.getElementById('pagination').innerHTML = '';
            return;
        }
        emptyState.style.display = 'none';

        clients.forEach(c => {
            const statusColor = c.Status === 'عميل محتمل' ? '#f5af19' : c.Status === 'تحت الجلسات' ? '#38ef7d' : '#fff';
            tbody.innerHTML += `
                <tr>
                    <td>${c.FullName}</td>
                    <td>${c.Phone}</td>
                    <td>${c.PreferredBranch}</td>
                    <td>${c.RequiredSpecialty}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor};">${c.Status}</span></td>
                    <td><button class="btn-primary" style="padding:5px 10px; font-size:12px;">تفاصيل</button></td>
                </tr>
            `;
        });

        // رسم الترقيم
        const totalPages = Math.ceil(total / 20);
        const paginationDiv = document.getElementById('pagination');
        paginationDiv.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            paginationDiv.innerHTML += `<button class="page-btn ${i === page ? 'active' : ''}" onclick="fetchClients(${i}, '${searchQuery}')">${i}</button>`;
        }
    }

    // البحث الفوري (Debounce)
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value;
            currentPage = 1;
            fetchClients(currentPage, searchQuery);
        }, 500);
    });

    // فتح وإغلاق النافذة المنبثقة (Modal)
    const modal = document.getElementById('clientModal');
    document.getElementById('addClientBtn').addEventListener('click', () => modal.classList.add('active'));
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

    // إضافة عميل جديد
    document.getElementById('addClientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitClientBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loader = document.getElementById('clientLoader');
        
        const clientData = {
            action: 'addClient', token,
            fullName: document.getElementById('fullName').value,
            phone: document.getElementById('phone').value,
            age: document.getElementById('age').value,
            preferredBranch: document.getElementById('preferredBranch').value,
            requiredSpecialty: document.getElementById('requiredSpecialty').value,
            source: document.getElementById('source').value,
            notes: document.getElementById('notes').value,
            createdBy: sessionStorage.getItem('username')
        };

        btnText.style.display = 'none'; loader.style.display = 'block'; submitBtn.disabled = true;

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(clientData)
            });
            const data = await response.json();

            if (data.success) {
                showToast('تم إضافة العميل بنجاح!', 'success');
                document.getElementById('addClientForm').reset();
                modal.classList.remove('active');
                fetchClients(currentPage, searchQuery); // تحديث الجدول
            } else { showToast(data.error, 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    // زر الخروج
    document.getElementById('logoutBtn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.href = 'index.html';
    });

    // تشغيل الدوال عند تحميل الصفحة
    fetchSettings();
    fetchClients(currentPage, searchQuery);
}