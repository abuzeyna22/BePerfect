const API_URL = 'https://script.google.com/macros/s/AKfycbxECxm06puNLLt-Tou7mDv0uLCZXl0wSgFN6ZB4ei2mZwmXu-5txLudtuPym8bxDbv5/exec';

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
    const currentUser = sessionStorage.getItem('username');
    document.getElementById('displayUsername').innerText = currentUser || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    let currentPage = 1, searchQuery = '', currentDetailClientId = '';
    let globalSettings = { branches: [], specialties: [], specialists: [], sources: [] };
    let chatPolling, allUsersForMention = [], allUsersForEdit = [];

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
            notes: document.getElementById('notes').value, createdBy: currentUser
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
            document.getElementById('newNoteText').value = ''; 

            const phone = String(client.Phone).replace(/\D/g, '');
            const message = `مرحباً ${client.FullName}، نتواصل معكم من مركز Be Perfect للصحة النفسية.`;
            document.getElementById('whatsappBtn').href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

            await fetchHistory(clientId);
            detailsModal.classList.add('active');
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    async function fetchHistory(clientId) {
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
    }

    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const data = {
            action: 'updateClient', token, clientId: currentDetailClientId,
            branch: document.getElementById('detailBranch').value, specialist: document.getElementById('detailSpecialist').value,
            newNote: document.getElementById('newNoteText').value, changedBy: currentUser
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('newNoteText').value = ''; await fetchHistory(currentDetailClientId); fetchClients(currentPage, searchQuery); fetchNotifs(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

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

    async function fetchNotifs() {
        try {
            const res = await fetch(`${API_URL}?action=getNotifs&token=${token}&user=${currentUser}`);
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
                        list.innerHTML += `<div class="notif-item ${!n.isRead ? 'unread' : ''}"><p style="margin-bottom:5px;">${n.message}</p><small style="font-size: 11px; opacity: 0.7;">${date}</small></div>`;
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
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'markNotifRead', token, user: currentUser }) });
            fetchNotifs();
        } catch (e) { console.error(e); }
    };

    const chatModal = document.getElementById('chatModal');
    document.getElementById('chatBtn').addEventListener('click', async () => {
        chatModal.classList.add('active');
        try {
            const res = await fetch(`${API_URL}?action=getUsers&token=${token}`);
            const data = await res.json();
            const select = document.getElementById('chatTarget');
            select.innerHTML = '<option value="General">شات عام (للجميع)</option>';
            allUsersForMention = [];
            if (data.success) {
                data.data.forEach(u => {
                    if (u.Username !== currentUser) {
                        select.innerHTML += `<option value="${u.Username}">${u.Username} (${u.JobTitle || 'موظف'})</option>`;
                        allUsersForMention.push(u);
                    }
                });
            }
        } catch (e) { console.error(e); }
        startChatPolling();
    });
    document.getElementById('closeChatModal').addEventListener('click', () => { chatModal.classList.remove('active'); clearInterval(chatPolling); });

    document.getElementById('chatTarget').addEventListener('change', fetchChat);

    async function fetchChat() {
        const target = document.getElementById('chatTarget').value;
        try {
            const res = await fetch(`${API_URL}?action=getChat&token=${token}&user=${currentUser}&target=${target}`);
            const data = await res.json();
            const box = document.getElementById('chatBox');
            box.innerHTML = '';
            if (data.success && data.data.length > 0) {
                data.data.forEach(msg => {
                    const isMe = msg.sender === currentUser;
                    const time = new Date(msg.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    let msgText = msg.message.replace(/@(\w+)/g, '<span style="color:#ff9a44; font-weight:bold;">@$1</span>');
                    box.innerHTML += `<div class="chat-msg ${isMe ? 'me' : 'other'}"><div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">${isMe ? 'أنت' : msg.sender} - ${time}</div>${msgText}</div>`;
                });
                box.scrollTop = box.scrollHeight;
            }
        } catch (e) { console.error('Chat Fetch Error', e); }
    }

    function startChatPolling() {
        fetchChat();
        clearInterval(chatPolling);
        chatPolling = setInterval(fetchChat, 3000);
    }

    const chatInput = document.getElementById('chatInput');
    const mentionDropdown = document.getElementById('mentionDropdown');
    let mentionActive = false;

    chatInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const lastChar = val[val.length - 1];
        if (lastChar === '@' && !mentionActive) {
            mentionActive = true;
            mentionDropdown.innerHTML = '';
            allUsersForMention.forEach(u => {
                const div = document.createElement('div');
                div.innerText = u.Username;
                div.className = 'mention-item';
                div.onclick = () => {
                    chatInput.value = val.substring(0, val.length - 1) + '@' + u.Username + ' ';
                    mentionDropdown.style.display = 'none';
                    mentionActive = false;
                    chatInput.focus();
                };
                mentionDropdown.appendChild(div);
            });
            mentionDropdown.style.display = 'block';
        } else if (mentionActive && (lastChar === ' ' || val.length === 0)) {
            mentionDropdown.style.display = 'none';
            mentionActive = false;
        }
    });

    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        if (!msg) return;
        const target = document.getElementById('chatTarget').value;
        try {
            await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'sendChat', token, sender: currentUser, receiver: target, message: msg }) });
            input.value = '';
            mentionDropdown.style.display = 'none';
            fetchChat();
            fetchNotifs();
        } catch (err) { showToast('فشل إرسال الرسالة', 'error'); }
    });

    // ====== منطق لوحة الأدمن المطورة ======
    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');
    if (sessionStorage.getItem('userRole') === 'Admin') { adminBtn.style.display = 'flex'; }
    adminBtn.addEventListener('click', () => { adminModal.classList.add('active'); loadUsersForAdmin(); });
    document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.classList.remove('active'));
    document.getElementById('editSettingType').addEventListener('change', populateEditDropdown);

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.getAttribute('data-tab')}`).classList.add('active');
        });
    });

    // جلب المستخدمين لوضعهم في قائمة التعديل المنسدلة
    async function loadUsersForAdmin() {
        try {
            const res = await fetch(`${API_URL}?action=getUsers&token=${token}`);
            const data = await res.json();
            const select = document.getElementById('editUserSelect');
            select.innerHTML = '<option value="">-- اختر مستخدم من القائمة --</option>';
            allUsersForEdit = [];
            if (data.success) {
                data.data.forEach(u => {
                    select.innerHTML += `<option value="${u.ID}">${u.Username} (${u.JobTitle || 'موظف'})</option>`;
                    allUsersForEdit.push(u);
                });
            }
        } catch (err) { showToast('فشل تحميل المستخدمين', 'error'); }
    }

    // عند اختيار مستخدم من القائمة المنسدلة، املأ الحقول ببياناته
    document.getElementById('editUserSelect').addEventListener('change', function() {
        const userId = this.value;
        const user = allUsersForEdit.find(u => u.ID === userId);
        if (user) {
            document.getElementById('editUserId').value = user.ID;
            document.getElementById('editUsername').value = user.Username; // (readonly) لا يمكن تغييره
            document.getElementById('editPassword').value = ''; // كلمة المرور لا تظهر للأمان
            document.getElementById('editJobTitle').value = user.JobTitle || '';
            document.getElementById('editEmail').value = user.Email || '';
            document.getElementById('editWhatsApp').value = user.WhatsApp || '';
            document.getElementById('editProfilePic').value = user.ProfilePic || '';
            document.getElementById('editRole').value = user.Role;
            document.getElementById('editUserBranch').value = user.Branch;
        } else {
            // مسح الحقول إذا لم يتم الاختيار
            document.getElementById('editUserForm').reset();
        }
    });

    // إضافة مستخدم جديد
    document.getElementById('addUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const data = {
            action: 'addUser', token,
            username: document.getElementById('addUsername').value,
            password: document.getElementById('addPassword').value,
            jobTitle: document.getElementById('addJobTitle').value,
            email: document.getElementById('addEmail').value,
            whatsapp: document.getElementById('addWhatsApp').value,
            profilePic: document.getElementById('addProfilePic').value,
            role: document.getElementById('addRole').value,
            branch: document.getElementById('addUserBranch').value || 'All'
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('addUserForm').reset(); loadUsersForAdmin(); } 
            else { showToast(result.error, 'error'); }
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    });

    // تعديل مستخدم حالي
    document.getElementById('editUserForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const userId = document.getElementById('editUserId').value;
        if (!userId) return showToast('يرجى اختيار مستخدم من القائمة أولاً', 'warning');
        
        const data = {
            action: 'updateUser', token, userId,
            username: document.getElementById('editUsername').value, // يرسل كما هو
            newPassword: document.getElementById('editPassword').value,
            jobTitle: document.getElementById('editJobTitle').value,
            email: document.getElementById('editEmail').value,
            whatsapp: document.getElementById('editWhatsApp').value,
            profilePic: document.getElementById('editProfilePic').value,
            role: document.getElementById('editRole').value,
            branch: document.getElementById('editUserBranch').value || 'All'
        };
        try {
            const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
            const result = await res.json();
            if (result.success) { showToast(result.data.message, 'success'); document.getElementById('editUserForm').reset(); loadUsersForAdmin(); } 
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
                body: JSON.stringify({ action: 'bulkAddClients', token, branch, clients: clientsArray, createdBy: currentUser })
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
