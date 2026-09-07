const API_URL = 'https://script.google.com/macros/s/AKfycbxy08Cfir5R6OLUN9IocfQRtNh2TJx0s3lOkVh5v9OJzlBYYmrei7LVKfCMKRYCPWDl/exec';

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
    if (!token && !window.location.href.includes('index.html')) { window.location.href = 'index.html'; }
    return token;
}

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

if (document.querySelector('.dashboard-body')) {
    const token = checkAuth();
    document.getElementById('displayUsername').innerText = sessionStorage.getItem('username') || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    let currentPage = 1;
    let searchQuery = '';
    let currentDetailClientId = '';
    let globalSettings = { branches: [], specialties: [], specialists: [] };

    async function fetchSettings() {
        try {
            const response = await fetch(`${API_URL}?action=getSettings`);
            const data = await response.json();
            if (data.success) {
                globalSettings = data.data;
                populateDropdowns();
                populateEditDropdown();
                populateImportDropdown();
            }
        } catch (error) { console.error('Settings Error:', error); }
    }

    function populateDropdowns() {
        const branchSelect = document.getElementById('preferredBranch');
        branchSelect.innerHTML = '';
        globalSettings.branches.forEach(b => { branchSelect.innerHTML += `<option value="${b}">${b}</option>`; });
        const specialtySelect = document.getElementById('requiredSpecialty');
        specialtySelect.innerHTML = '';
        globalSettings.specialties.forEach(s => { specialtySelect.innerHTML += `<option value="${s}">${s}</option>`; });
    }

    function populateEditDropdown() {
        const type = document.getElementById('editSettingType').value;
        const oldValSelect = document.getElementById('editOldValue');
        oldValSelect.innerHTML = '';
        let items = [];
        if (type === 'Branch') items = globalSettings.branches;
        else if (type === 'Specialty') items = globalSettings.specialties;
        else if (type === 'Specialist') items = globalSettings.specialists;
        items.forEach(item => { oldValSelect.innerHTML += `<option value="${item}">${item}</option>`; });
    }

    function populateImportDropdown() {
        const importBranchSelect = document.getElementById('importBranch');
        importBranchSelect.innerHTML = '';
        globalSettings.branches.forEach(b => { importBranchSelect.innerHTML += `<option value="${b}">${b}</option>`; });
    }

    async function fetchClients(page = 1, search = '') {
        try {
            const url = `${API_URL}?action=getClients&token=${token}&page=${page}&search=${encodeURIComponent(search)}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.success) { renderTable(data.data.clients, data.data.total, page); }
        } catch (error) { console.error('Fetch Clients Error:', error); }
    }

    function renderTable(clients, total, page) {
        const tbody = document.getElementById('clientsTableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';
        if (clients.length === 0) { emptyState.style.display = 'block'; document.getElementById('pagination').innerHTML = ''; return; }
        emptyState.style.display = 'none';
        
        clients.forEach(c => {
            const statusColor = c.Status === 'عميل محتمل' ? '#f5af19' : c.Status === 'تحت الجلسات' ? '#38ef7d' : '#fff';
            tbody.innerHTML += `
                <tr>
                    <td><span style="background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:5px; font-size:12px;">${c.ClientID}</span></td>
                    <td>${c.FullName}</td>
                    <td>${c.Phone}</td>
                    <td>${c.PreferredBranch}</td>
                    <td>${c.RequiredSpecialty}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor};">${c.Status}</span></td>
                    <td><button class="btn-primary btn-details" data-clientid="${c.ClientID}" style="padding:5px 10px; font-size:12px;">تفاصيل</button></td>
                </tr>
            `;
        });

        // إصلاح الترقيم (Pagination)
        const totalPages = Math.ceil(total / 20);
        const paginationDiv = document.getElementById('pagination');
        paginationDiv.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === page ? 'active' : ''}`;
            btn.innerText = i;
            btn.addEventListener('click', () => {
                currentPage = i;
                fetchClients(currentPage, searchQuery);
            });
            paginationDiv.appendChild(btn);
        }

        // إصلاح زر التفاصيل (Details)
        document.querySelectorAll('.btn-details').forEach(btn => {
            btn.addEventListener('click', (e) => openClientDetails(e.target.getAttribute('data-clientid')));
        });
    }

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { searchQuery = e.target.value; currentPage = 1; fetchClients(currentPage, searchQuery); }, 500);
    });

    const modal = document.getElementById('clientModal');
    document.getElementById('addClientBtn').addEventListener('click', () => modal.classList.add('active'));
    document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('active'));

    document.getElementById('addClientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitClientBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loader = document.getElementById('clientLoader');
        const clientData = {
            action: 'addClient', token,
            fullName: document.getElementById('fullName').value, phone: document.getElementById('phone').value,
            age: document.getElementById('age').value, preferredBranch: document.getElementById('preferredBranch').value,
            requiredSpecialty: document.getElementById('requiredSpecialty').value, source: document.getElementById('source').value,
            notes: document.getElementById('notes').value, createdBy: sessionStorage.getItem('username')
        };
        btnText.style.display = 'none'; loader.style.display = 'block'; submitBtn.disabled = true;
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(clientData) });
            const data = await response.json();
            if (data.success) { showToast('تم إضافة العميل بنجاح!', 'success'); document.getElementById('addClientForm').reset(); modal.classList.remove('active'); fetchClients(currentPage, searchQuery); }
            else { showToast(data.error, 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html'; });

    // ====== منطق كارت تفاصيل العميل ======
    const detailsModal = document.getElementById('clientDetailsModal');
    document.getElementById('closeDetailsModal').addEventListener('click', () => detailsModal.classList.remove('active'));

    async function openClientDetails(clientId) {
        currentDetailClientId = clientId;
        try {
            // جلب بيانات العميل
            const res = await fetch(`${API_URL}?action=getClientById&token=${token}&clientId=${clientId}`);
            const data = await res.json();
            if (!data.success) return showToast(data.error, 'error');
            
            const client = data.data;
            document.getElementById('detailClientName').innerText = client.FullName;
            document.getElementById('detailClientID').value = client.ClientID;
            document.getElementById('detailPhone').value = client.Phone;
            
            // تعبئة قائمة الفروع في كارت التفاصيل
            const branchSelect = document.getElementById('detailBranch');
            branchSelect.innerHTML = '';
            globalSettings.branches.forEach(b => { branchSelect.innerHTML += `<option value="${b}" ${b === client.PreferredBranch ? 'selected' : ''}>${b}</option>`; });
            
            // تعبئة قائمة الأخصائيين
            const specialistSelect = document.getElementById('detailSpecialist');
            specialistSelect.innerHTML = '<option value="">لا يوجد</option>';
            globalSettings.specialists.forEach(s => { specialistSelect.innerHTML += `<option value="${s}" ${s === client.AssignedSpecialist ? 'selected' : ''}>${s}</option>`; });

            // جلب سجل التغييرات (History)
            const resHist = await fetch(`${API_URL}?action=getHistory&token=${token}&clientId=${clientId}`);
            const dataHist = await resHist.json();
            const historyBody = document.getElementById('historyTableBody');
            historyBody.innerHTML = '';
            
            if (dataHist.success && dataHist.data.length > 0) {
                dataHist.data.forEach(h => {
                    const date = new Date(h.date).toLocaleString('ar-EG');
                    historyBody.innerHTML += `<tr><td>${h.field}</td><td>${h.oldVal}</td><td>${h.newVal}</td><td>${h.changedBy}</td><td>${date}</td></tr>`;
                });
            } else {
                historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.7;">لا يوجد تغييرات مسجلة</td></tr>`;
            }
            
            detailsModal.classList.add('active');
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    // حفظ تعديلات العميل (الفرع والأخصائي)
    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const data = {
            action: 'updateClient', token, clientId: currentDetailClientId,
            branch: document.getElementById('detailBranch').value,
            specialist: document.getElementById('detailSpecialist').value,
            changedBy: sessionStorage.getItem('username')
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) {
                showToast(result.data.message, 'success');
                openClientDetails(currentDetailClientId); // تحديث الكارت
                fetchClients(currentPage, searchQuery); // تحديث الجدول
            } else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    // ====== منطق لوحة الأدمن ======
    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');
    if (sessionStorage.getItem('userRole') === 'Admin') { adminBtn.style.display = 'flex'; }
    adminBtn.addEventListener('click', () => adminModal.classList.add('active'));
    document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.classList.remove('active'));
    document.getElementById('editSettingType').addEventListener('change', populateEditDropdown);

    document.getElementById('addUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'addUser', token, username: document.getElementById('newUsername').value, password: document.getElementById('newPassword').value, role: document.getElementById('newRole').value, branch: document.getElementById('newUserBranch').value || 'All' };
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const res = await response.json();
            if (res.success) { showToast('تم إضافة المستخدم بنجاح!', 'success'); document.getElementById('addUserForm').reset(); } else { showToast(res.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('addSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'addSetting', token, type: document.getElementById('settingType').value, value: document.getElementById('settingValue').value };
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const res = await response.json();
            if (res.success) { showToast('تمت الإضافة بنجاح!', 'success'); document.getElementById('addSettingForm').reset(); fetchSettings(); } else { showToast(res.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('editSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'updateSetting', token, type: document.getElementById('editSettingType').value, oldValue: document.getElementById('editOldValue').value, newValue: document.getElementById('editNewValue').value };
        try {
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const res = await response.json();
            if (res.success) { showToast('تم التعديل بنجاح!', 'success'); document.getElementById('editSettingForm').reset(); fetchSettings(); } else { showToast(res.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('importClientsForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const importBtn = document.getElementById('importBtn');
        const btnText = importBtn.querySelector('.btn-text');
        const loader = document.getElementById('importLoader');
        const fileInput = document.getElementById('importFile');
        const branch = document.getElementById('importBranch').value;
        
        if (!fileInput.files[0]) { return showToast('يرجى اختيار ملف CSV', 'warning'); }
        btnText.style.display = 'none'; loader.style.display = 'block'; importBtn.disabled = true;

        try {
            const file = fileInput.files[0];
            const text = await file.text();
            const lines = text.split('\n').filter(line => line.trim() !== '');
            const clientsArray = [];
            const startIndex = 1; // نتخطى عناوين الأعمدة
            
            for (let i = startIndex; i < lines.length; i++) {
                const parts = lines[i].split(/[,،\t]/);
                const cleanPart = (p) => p ? p.replace(/^"|"$/g, '').trim() : '';
                const name = cleanPart(parts[2]); const phone = cleanPart(parts[3]);
                const age = cleanPart(parts[4]); const csvBranch = cleanPart(parts[7]);
                const specialist = cleanPart(parts[8]); const notes = cleanPart(parts[13]);
                if (name && phone) { clientsArray.push({ name, phone, age, csvBranch, specialist, notes }); }
            }

            if (clientsArray.length === 0) { 
                btnText.style.display = 'inline'; loader.style.display = 'none'; importBtn.disabled = false;
                return showToast('لم يتم العثور على بيانات صحيحة', 'warning'); 
            }

            const response = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'bulkAddClients', token, branch, clients: clientsArray, createdBy: sessionStorage.getItem('username') })
            });
            const res = await response.json();
            if (res.success) {
                showToast(res.data.message, 'success');
                document.getElementById('importClientsForm').reset();
                fetchClients(currentPage, searchQuery); 
            } else { showToast(res.error, 'error'); }
        } catch (err) { showToast('فشل قراءة الملف', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; importBtn.disabled = false; }
    });

    fetchSettings();
    fetchClients(currentPage, searchQuery);
}
