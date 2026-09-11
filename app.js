const API_URL = 'https://script.google.com/macros/s/AKfycbyzHy_lUKI4pWjDO4dba8Vb_cRpLqTuNFoNmuPNagCGSv9w9qDnX4AytppqC69vDb5o/exec';

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

function exportToCSV(data, filename) {
    if (data.length === 0) return showToast('لا توجد بيانات في هذا التقرير', 'warning');
    const headers = Object.keys(data[0]);
    const csvRows = []; csvRows.push(headers.join(','));
    data.forEach(row => {
        const values = headers.map(header => {
            let val = row[header] === null || row[header] === undefined ? '' : String(row[header]);
            val = val.replace(/"/g, '""'); return `"${val}"`;
        });
        csvRows.push(values.join(','));
    });
    const csvString = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; link.click();
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
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'login', username, password }) });
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

    let currentPage = 1, searchQuery = '', currentDetailClientId = '';
    let globalSettings = { branches: [], specialties: [], specialists: [], sources: [] };

    async function fetchSettings() {
        try {
            const response = await fetch(`${API_URL}?action=getSettings`);
            const data = await response.json();
            if (data.success) {
                globalSettings = data.data;
                populateDropdowns(); populateEditDropdown(); populateImportDropdown(); populateReportDropdown();
            }
        } catch (error) { console.error('Settings Error:', error); }
    }

    function populateDropdowns() {
        document.getElementById('preferredBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('requiredSpecialty').innerHTML = globalSettings.specialties.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('source').innerHTML = globalSettings.sources.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    function populateEditDropdown() {
        const type = document.getElementById('editSettingType').value;
        const items = type === 'Branch' ? globalSettings.branches : type === 'Specialty' ? globalSettings.specialties : type === 'Specialist' ? globalSettings.specialists : globalSettings.sources;
        document.getElementById('editOldValue').innerHTML = items.map(item => `<option value="${item}">${item}</option>`).join('');
    }

    function populateImportDropdown() { document.getElementById('importBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join(''); }
    function populateReportDropdown() { document.getElementById('reportBranch').innerHTML = '<option value="All">كل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join(''); }

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
                    <td>${c.FullName}</td><td>${c.Phone}</td><td>${c.PreferredBranch}</td><td>${c.RequiredSpecialty}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor};">${c.Status}</span></td>
                    <td><button class="btn-primary btn-details" data-clientid="${c.ClientID}" style="padding:5px 10px; font-size:12px;">تفاصيل</button></td>
                </tr>
            `;
        });
        const totalPages = Math.ceil(total / 20);
        const paginationDiv = document.getElementById('pagination');
        paginationDiv.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.className = `page-btn ${i === page ? 'active' : ''}`;
            btn.innerText = i;
            btn.addEventListener('click', () => { currentPage = i; fetchClients(currentPage, searchQuery); });
            paginationDiv.appendChild(btn);
        }
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
            if (data.success) { showToast('تم إضافة العميل بنجاح!', 'success'); document.getElementById('addClientForm').reset(); modal.classList.remove('active'); fetchClients(currentPage, searchQuery); fetchNotifs(); }
            else { showToast(data.error, 'error'); }
        } catch (error) { showToast('فشل الاتصال بالخادم', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html'; });

    // ====== كارت تفاصيل العميل ======
    const detailsModal = document.getElementById('clientDetailsModal');
    document.getElementById('closeDetailsModal').addEventListener('click', () => detailsModal.classList.remove('active'));

    async function openClientDetails(clientId) {
        currentDetailClientId = clientId;
        try {
            const res = await fetch(`${API_URL}?action=getClientById&token=${token}&clientId=${clientId}`);
            const data = await res.json();
            if (!data.success) return showToast(data.error, 'error');
            const client = data.data;
            document.getElementById('detailClientName').innerText = client.FullName;
            document.getElementById('detailClientID').value = client.ClientID;
            document.getElementById('detailPhone').value = client.Phone;
            document.getElementById('detailBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}" ${b === client.PreferredBranch ? 'selected' : ''}>${b}</option>`).join('');
            document.getElementById('detailSpecialist').innerHTML = '<option value="">لا يوجد</option>' + globalSettings.specialists.map(s => `<option value="${s}" ${s === client.AssignedSpecialist ? 'selected' : ''}>${s}</option>`).join('');

            const phone = String(client.Phone).replace(/\D/g, '');
            const message = `مرحباً ${client.FullName}، نتواصل معكم من مركز Be Perfect للصحة النفسية.`;
            document.getElementById('whatsappBtn').href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

            const resHist = await fetch(`${API_URL}?action=getHistory&token=${token}&clientId=${clientId}`);
            const dataHist = await resHist.json();
            const historyBody = document.getElementById('historyTableBody');
            historyBody.innerHTML = '';
            if (dataHist.success && dataHist.data.length > 0) {
                dataHist.data.forEach(h => {
                    const date = new Date(h.date).toLocaleString('ar-EG');
                    historyBody.innerHTML += `<tr><td>${h.field}</td><td>${h.oldVal}</td><td>${h.newVal}</td><td>${h.changedBy}</td><td>${date}</td></tr>`;
                });
            } else { historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.7;">لا يوجد تغييرات مسجلة</td></tr>`; }
            detailsModal.classList.add('active');
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const data = {
            action: 'updateClient', token, clientId: currentDetailClientId,
            branch: document.getElementById('detailBranch').value, specialist: document.getElementById('detailSpecialist').value,
            changedBy: sessionStorage.getItem('username')
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); openClientDetails(currentDetailClientId); fetchClients(currentPage, searchQuery); fetchNotifs(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    // ====== منطق التقارير ======
    const reportModal = document.getElementById('reportModal');
    document.getElementById('reportBtn').addEventListener('click', () => reportModal.classList.add('active'));
    document.getElementById('closeReportModal').addEventListener('click', () => reportModal.classList.remove('active'));

    document.getElementById('reportForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('generateReportBtn');
        const btnText = btn.querySelector('.btn-text');
        const loader = document.getElementById('reportLoader');
        const month = document.getElementById('reportMonth').value;
        const year = document.getElementById('reportYear').value;
        const branch = document.getElementById('reportBranch').value;
        btnText.style.display = 'none'; loader.style.display = 'block'; btn.disabled = true;
        try {
            const url = `${API_URL}?action=getMonthlyReport&token=${token}&month=${month}&year=${year}&branch=${encodeURIComponent(branch)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                exportToCSV(data.data, `Report_${month}_${year}_${branch}.csv`);
                showToast('تم تجهيز التقرير بنجاح', 'success');
                reportModal.classList.remove('active');
            } else { showToast(data.error, 'error'); }
        } catch (err) { showToast('فشل生成 التقرير', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; btn.disabled = false; }
    });

    // ====== منطق التنبيهات (Notifications) ======
    async function fetchNotifs() {
        try {
            const role = sessionStorage.getItem('userRole');
            const res = await fetch(`${API_URL}?action=getNotifs&token=${token}&role=${role}`);
            const data = await res.json();
            if (data.success) {
                const unread = data.data.filter(n => !n.isRead).length;
                const badge = document.getElementById('notifBadge');
                badge.innerText = unread;
                badge.style.display = unread > 0 ? 'flex' : 'none';
                
                const list = document.getElementById('notifList');
                list.innerHTML = '';
                if (data.data.length === 0) {
                    list.innerHTML = '<div class="notif-item" style="text-align:center; opacity:0.7;">لا توجد تنبيهات</div>';
                } else {
                    data.data.forEach(n => {
                        const date = new Date(n.date).toLocaleString('ar-EG');
                        list.innerHTML += `<div class="notif-item ${!n.isRead ? 'unread' : ''}">
                            <p style="margin-bottom:5px;">${n.message}</p>
                            <small style="font-size: 11px; opacity: 0.7;">${date}</small>
                        </div>`;
                    });
                }
            }
        } catch (e) { console.error('Notif Error', e); }
    }

    window.toggleNotifs = function() {
        const dropdown = document.getElementById('notifDropdown');
        dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    };

    window.markNotifsRead = async function() {
        try {
            const role = sessionStorage.getItem('userRole');
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'markNotifRead', token, role }) });
            fetchNotifs();
        } catch (e) { console.error(e); }
    };

    // ====== منطق لوحة الأدمن (بالتبويبات) ======
    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');
    if (sessionStorage.getItem('userRole') === 'Admin') { adminBtn.style.display = 'flex'; }
    adminBtn.addEventListener('click', () => { adminModal.classList.add('active'); loadUsers(); });
    document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.classList.remove('active'));
    document.getElementById('editSettingType').addEventListener('change', populateEditDropdown);

    // منطق التبويبات
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.getAttribute('data-tab')}`).classList.add('active');
        });
    });

    async function loadUsers() {
        try {
            const res = await fetch(`${API_URL}?action=getUsers&token=${token}`);
            const data = await res.json();
            const tbody = document.getElementById('usersTableBody');
            tbody.innerHTML = '';
            if (data.success) {
                data.data.forEach(u => {
                    tbody.innerHTML += `<tr>
                        <td>${u.username}</td><td>${u.jobTitle || '-'}</td><td>${u.role}</td>
                        <td><button class="btn-primary btn-edit-user" data-userid="${u.id}" style="padding:3px 8px; font-size:11px; background: #6a11cb;">تعديل</button></td>
                    </tr>`;
                });
                document.querySelectorAll('.btn-edit-user').forEach(btn => {
                    btn.addEventListener('click', (e) => editUser(e.target.getAttribute('data-userid'), data.data));
                });
            }
        } catch (err) { showToast('فشل تحميل المستخدمين', 'error'); }
    }

    function editUser(userId, usersList) {
        const user = usersList.find(u => u.id === userId);
        if (user) {
            document.getElementById('editUserId').value = user.id;
            document.getElementById('newUsername').value = user.username;
            document.getElementById('newPassword').value = '';
            document.getElementById('newJobTitle').value = user.jobTitle;
            document.getElementById('newEmail').value = user.email;
            document.getElementById('newWhatsApp').value = user.whatsapp;
            document.getElementById('newProfilePic').value = user.profilePic;
            document.getElementById('newRole').value = user.role;
            document.getElementById('newUserBranch').value = user.branch;
        }
    }

    document.getElementById('userManagementForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const userId = document.getElementById('editUserId').value;
        const data = {
            action: userId ? 'updateUser' : 'addUser', token,
            userId: userId,
            username: document.getElementById('newUsername').value,
            password: document.getElementById('newPassword').value,
            jobTitle: document.getElementById('newJobTitle').value,
            email: document.getElementById('newEmail').value,
            whatsapp: document.getElementById('newWhatsApp').value,
            profilePic: document.getElementById('newProfilePic').value,
            role: document.getElementById('newRole').value,
            branch: document.getElementById('newUserBranch').value || 'All'
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('userManagementForm').reset(); loadUsers(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('addSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'addSetting', token, type: document.getElementById('settingType').value, value: document.getElementById('settingValue').value };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast('تمت الإضافة بنجاح!', 'success'); document.getElementById('addSettingForm').reset(); fetchSettings(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    document.getElementById('editSettingForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = { action: 'updateSetting', token, type: document.getElementById('editSettingType').value, oldValue: document.getElementById('editOldValue').value, newValue: document.getElementById('editNewValue').value };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast('تم التعديل بنجاح!', 'success'); document.getElementById('editSettingForm').reset(); fetchSettings(); } 
            else { showToast(result.error, 'error'); }
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
            for (let i = 1; i < lines.length; i++) {
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
            const res = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'bulkAddClients', token, branch, clients: clientsArray, createdBy: sessionStorage.getItem('username') })
            });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('importClientsForm').reset(); fetchClients(currentPage, searchQuery); fetchNotifs(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل قراءة الملف', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; importBtn.disabled = false; }
    });

    // بدء التشغيل
    fetchSettings();
    fetchClients(currentPage, searchQuery);
    fetchNotifs();
    setInterval(fetchNotifs, 30000); 
}
