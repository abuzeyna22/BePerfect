// ====== إعدادات Supabase ======
const SUPABASE_URL = 'https://wwucyjrbadjaerqgyzyn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3dWN5anJiYWRqYWVycWd5enluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNjk0MzksImV4cCI6MjEwNTk0NTQzOX0._08cTLRhNfXwiNCaY1zOvmaMxAzVVkAiPqnHYRYQRU8';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const IMGBB_API_KEY = '71307118640265da76172e90445b208b';
const SECRET_TOKEN = 'BP_CRM_SECURE_TOKEN_2024';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

let audioCtx;
function playBeep() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let oscillator = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        oscillator.connect(gain);
        gain.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch(e) { console.log("Audio not supported"); }
}

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

function parsePhones(phoneArray) {
    if (!phoneArray || !Array.isArray(phoneArray)) return [];
    return phoneArray.map(p => ({ num: p.num || '', wa: p.wa || false }));
}

async function uploadImageToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) return data.data.url;
        throw new Error('فشل رفع الصورة');
    } catch (err) { throw new Error('فشل الاتصال بمزود الصور'); }
}

// ====== منطق تسجيل الدخول ======
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
            const { data, error } = await db.from('users').select('*').eq('username', username).single();
            if (error || !data) throw new Error('اسم المستخدم غير موجود');
            
            const hashedPassword = await sha256(password + SECRET_TOKEN);
            if (data.password_hash !== hashedPassword) throw new Error('كلمة المرور غير صحيحة');
            
            showToast('تم تسجيل الدخول بنجاح!', 'success');
            sessionStorage.setItem('authToken', data.id);
            sessionStorage.setItem('userRole', data.role);
            sessionStorage.setItem('username', data.username);
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
            
        } catch (error) { showToast(error.message, 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; loginBtn.disabled = false; }
    });
}

// ====== لوحة التحكم ======
if (document.querySelector('.dashboard-body')) {
    const token = checkAuth();
    const currentUser = sessionStorage.getItem('username');
    document.getElementById('displayUsername').innerText = currentUser || 'مستخدم';
    document.getElementById('displayRole').innerText = sessionStorage.getItem('userRole') || 'دور';

    let currentPage = 1, searchQuery = '', currentDetailClientId = '';
    let globalSettings = { branches: ['السيوف', 'ميامي', 'لوران', 'سموحة 1', 'سموحة 2', 'سبورتنج 1', 'سبورتنج 2', 'العجمي', 'أونلاين'], specialties: ['تعديل سلوك', 'تخاطب', 'كابل ثيرابي', 'التريكز والقلق', 'الصدمات', 'مشكلات دراسية', 'استشارات أونلاين'], specialists: ['د. مريم', 'د. أحمد', 'د. سارة'], sources: ['سوشيال ميديا', 'مكالمة مباشرة', 'زيارة فرع', 'إحالة', 'ورشة عمل'] };
    let chatPolling, allUsersForMention = [], allUsersForEdit = [];
    let lastUnreadCount = 0;

    function populateDropdowns() {
        document.getElementById('preferredBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('requiredSpecialty').innerHTML = globalSettings.specialties.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('source').innerHTML = globalSettings.sources.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('detailBranch').innerHTML = globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('detailSpecialist').innerHTML = '<option value="">لا يوجد</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('appSpecialist').innerHTML = '<option value="">اختر أخصائي</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('newAppSpecialist').innerHTML = '<option value="">لا يوجد</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('referralType').innerHTML = '<option value="صديق">صديق</option><option value="جوجل ماب">جوجل ماب</option><option value="لافتة">لافتة</option><option value="عادة">عادة</option>';
        
        document.getElementById('filterBranch').innerHTML = '<option value="All">كل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('filterSource').innerHTML = '<option value="All">كل المصادر</option>' + globalSettings.sources.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('filterSpecialty').innerHTML = '<option value="All">كل التخصصات</option>' + globalSettings.specialties.map(s => `<option value="${s}">${s}</option>`).join('');
        document.getElementById('filterSpecialist').innerHTML = '<option value="All">كل الأخصائيين</option>' + globalSettings.specialists.map(s => `<option value="${s}">${s}</option>`).join('');
        
        const userBranches = '<option value="All">All لكل الفروع</option>' + globalSettings.branches.map(b => `<option value="${b}">${b}</option>`).join('');
        document.getElementById('addUserBranch').innerHTML = userBranches;
        document.getElementById('editUserBranch').innerHTML = userBranches;
    }
    populateDropdowns();

    async function fetchStats() {
        try {
            const { count: total } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('is_archived', false);
            const today = new Date(); today.setHours(0,0,0,0);
            const { count: todayCount } = await db.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', today.toISOString()).eq('is_archived', false);
            const { count: late } = await db.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'متأخر/متوقف').eq('is_archived', false);
            
            document.getElementById('totalClients').innerText = total || 0;
            document.getElementById('todayClients').innerText = todayCount || 0;
            document.getElementById('lateClients').innerText = late || 0;
            document.getElementById('pendingClients').innerText = '0'; 
        } catch (e) { console.error('Stats Error:', e); }
    }

    async function fetchClients(page = 1, search = '') {
        try {
            const fBranch = document.getElementById('filterBranch').value;
            const fStatus = document.getElementById('filterStatus').value;
            const fArchived = document.getElementById('filterArchived').checked;
            
            let query = db.from('clients').select('*', { count: 'exact' }).eq('is_archived', fArchived);
            
            if (fBranch !== 'All') query = query.eq('preferred_branch', fBranch);
            if (fStatus !== 'All') query = query.eq('status', fStatus);
            if (search) query = query.ilike('full_name', `%${search}%`);
            
            const start = (page - 1) * 20;
            const { data, count, error } = await query.order('created_at', { ascending: false }).range(start, start + 19);
            if (error) throw error;
            renderTable(data || [], count || 0, page);
        } catch (error) { console.error('Fetch Clients Error:', error); showToast('فشل جلب العملاء', 'error'); }
    }

    function renderTable(clients, total, page) {
        const tbody = document.getElementById('clientsTableBody');
        const emptyState = document.getElementById('emptyState');
        tbody.innerHTML = '';
        if (!clients || clients.length === 0) { emptyState.style.display = 'block'; document.getElementById('pagination').innerHTML = ''; return; }
        emptyState.style.display = 'none';
        
        const statusColors = { 'عميل محتمل': '#f5af19', 'تم الحجز': '#2575fc', 'تحت الجلسات': '#38ef7d', 'متأخر/متوقف': '#ff3b3b', 'مكتمل': '#aaaaaa' };
        
        clients.forEach(c => {
            const statusColor = statusColors[c.status] || '#fff';
            const date = c.created_at ? new Date(c.created_at).toLocaleDateString('ar-EG') : '-';
            const isLate = c.status === 'متأخر/متوقف';
            const archBtn = c.is_archived ? 
                `<button class="btn-primary unarchive-btn" data-id="${c.id}" style="padding:3px 6px; font-size:10px; background: #11998e;">إلغاء الأرشفة</button>` : 
                `<button class="btn-primary archive-btn" data-id="${c.id}" style="padding:3px 6px; font-size:10px; background: #6a11cb;">أرشفة</button>`;
            const phonesStr = (c.phones || []).map(p => `${p.num}${p.wa ? ' (واتساب)' : ''}`).join(', ');
            
            tbody.innerHTML += `
                <tr ${isLate ? 'class="status-late"' : ''}>
                    <td><span style="background:rgba(255,255,255,0.1); padding:3px 8px; border-radius:5px; font-size:12px;">${c.client_code}</span></td>
                    <td>${c.full_name}</td>
                    <td>${phonesStr}</td>
                    <td>${c.preferred_branch}</td>
                    <td style="font-size:12px;">${c.source || '-'}</td>
                    <td style="font-size:12px;">${c.created_by || '-'}</td>
                    <td style="font-size:12px; opacity:0.8;">${date}</td>
                    <td><span class="status-badge" style="background:${statusColor}30; color:${statusColor}; font-weight:bold;">${c.status}</span></td>
                    <td style="display:flex; gap:5px;">
                        <button class="btn-primary btn-details" data-clientid="${c.id}" style="padding:5px 10px; font-size:12px;">تفاصيل</button>
                        ${archBtn}
                    </td>
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
        
        document.querySelectorAll('.btn-details').forEach(btn => btn.addEventListener('click', (e) => openClientDetails(e.currentTarget.getAttribute('data-clientid'))));
        document.querySelectorAll('.archive-btn, .unarchive-btn').forEach(btn => btn.addEventListener('click', (e) => archiveClient(e.currentTarget.getAttribute('data-id'), e.currentTarget.classList.contains('archive-btn'))));
    }

    async function archiveClient(clientId, archive) {
        try {
            const { error } = await db.from('clients').update({ is_archived: archive }).eq('id', clientId);
            if (error) throw error;
            showToast(archive ? 'تم أرشفة العميل' : 'تم إلغاء الأرشفة', 'success');
            fetchClients(currentPage, searchQuery); fetchStats();
        } catch (err) { showToast('فشل الاتصال', 'error'); }
    }

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { searchQuery = e.target.value; currentPage = 1; fetchClients(currentPage, searchQuery); }, 500);
    });

    ['filterBranch', 'filterStatus', 'filterArchived'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => { currentPage = 1; fetchClients(currentPage, searchQuery); });
    });

    // الأزرار الأساسية (Modals)
    const clientModal = document.getElementById('clientModal');
    document.getElementById('addClientBtn').addEventListener('click', () => {
        document.getElementById('phonesContainer').innerHTML = `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" required>
                <label class="wa-check"><input type="checkbox" class="phone-wa"> واتساب</label>
                <button type="button" class="remove-phone" onclick="removePhoneRow(this)">X</button>
            </div>
        `;
        clientModal.classList.add('active');
    });
    document.getElementById('closeModalBtn').addEventListener('click', () => clientModal.classList.remove('active'));
    document.getElementById('logoutBtn').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html'; });

    document.getElementById('addPhoneBtn').addEventListener('click', () => {
        const container = document.getElementById('phonesContainer');
        container.innerHTML += `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" required>
                <label class="wa-check"><input type="checkbox" class="phone-wa"> واتساب</label>
                <button type="button" class="remove-phone" onclick="removePhoneRow(this)">X</button>
            </div>
        `;
    });

    window.removePhoneRow = function(button) {
        const container = document.getElementById('phonesContainer');
        if (container.children.length > 1) button.parentElement.remove();
    };

    // إضافة العميل (Supabase)
    document.getElementById('addClientForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitClientBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const loader = document.getElementById('clientLoader');
        
        const phones = [];
        document.querySelectorAll('.phone-row').forEach(row => {
            const num = row.querySelector('.phone-input').value.trim();
            const wa = row.querySelector('.phone-wa').checked;
            if (num) phones.push({ num, wa });
        });

        if (phones.length === 0) return showToast('يرجى إدخال رقم هاتف واحد على الأقل', 'warning');

        const clientData = {
            client_code: 'BP-TEMP', 
            full_name: document.getElementById('fullName').value, 
            age: document.getElementById('age').value, 
            preferred_branch: document.getElementById('preferredBranch').value,
            required_specialty: document.getElementById('requiredSpecialty').value, 
            source: document.getElementById('source').value,
            notes: document.getElementById('notes').value, 
            created_by: currentUser,
            owner: currentUser,
            phones: phones,
            status: 'عميل محتمل'
        };
        
        btnText.style.display = 'none'; loader.style.display = 'block'; submitBtn.disabled = true;
        try {
            const { data, error } = await db.from('clients').insert([clientData]).select();
            if (error) throw error;
            
            const newClientId = data[0].id;
            const { count } = await db.from('clients').select('*', { count: 'exact', head: true });
            await db.from('clients').update({ client_code: 'BP-' + (1000 + count) }).eq('id', newClientId);
            
            showToast('تم إضافة العميل بنجاح!', 'success'); 
            document.getElementById('addClientForm').reset(); 
            clientModal.classList.remove('active'); 
            fetchClients(currentPage, searchQuery); 
            fetchStats();
        } catch (error) { showToast(error.message, 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; submitBtn.disabled = false; }
    });

    const detailsModal = document.getElementById('clientDetailsModal');
    document.getElementById('closeDetailsModal').addEventListener('click', () => detailsModal.classList.remove('active'));

    async function openClientDetails(clientId) {
        currentDetailClientId = clientId;
        try {
            const { data: client, error } = await db.from('clients').select('*').eq('id', clientId).single();
            if (error) throw error;
            
            document.getElementById('detailClientName').innerText = client.full_name;
            document.getElementById('detailClientID').value = client.client_code;
            document.getElementById('detailBranch').value = client.preferred_branch;
            document.getElementById('detailSpecialist').value = client.assigned_specialist || "";
            document.getElementById('detailStatus').value = client.status || "عميل محتمل";
            document.getElementById('newNoteText').value = ''; 
            
            const phonesContainer = document.getElementById('detailPhonesContainer');
            phonesContainer.innerHTML = '';
            const phones = parsePhones(client.phones);
            if (phones.length === 0) { addDetailPhoneRow(); } 
            else { phones.forEach(p => addDetailPhoneRow(p.num, p.wa)); }

            const waPhone = phones.find(p => p.wa);
            const phone = waPhone ? waPhone.num : (phones[0] ? phones[0].num : '');
            if (phone) {
                const cleanPhone = String(phone).replace(/\D/g, '');
                const message = `مرحباً ${client.full_name}، نتواصل معكم من مركز Be Perfect للصحة النفسية.`;
                document.getElementById('whatsappBtn').href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
            } else { document.getElementById('whatsappBtn').href = '#'; }

            detailsModal.classList.add('active'); 
            await fetchHistory(clientId);
            await fetchAppointments(clientId);
        } catch (err) { showToast('فشل تحميل بيانات العميل', 'error'); }
    }

    function addDetailPhoneRow(num = '', wa = false) {
        const container = document.getElementById('detailPhonesContainer');
        container.innerHTML += `
            <div class="phone-row">
                <input type="text" class="phone-input" placeholder="01012345678" value="${num}">
                <label class="wa-check"><input type="checkbox" class="phone-wa" ${wa ? 'checked' : ''}> واتساب</label>
                <button type="button" class="remove-phone" onclick="removeDetailPhoneRow(this)">X</button>
            </div>
        `;
    }
    window.removeDetailPhoneRow = function(button) {
        const container = document.getElementById('detailPhonesContainer');
        if (container.children.length > 1) button.parentElement.remove();
    };
    document.getElementById('addDetailPhoneBtn').addEventListener('click', () => addDetailPhoneRow());

    async function fetchHistory(clientId) {
        try {
            const { data, error } = await db.from('history').select('*').eq('client_id', clientId).order('changed_at', { ascending: false });
            if (error) throw error;
            const historyBody = document.getElementById('historyTableBody');
            historyBody.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(h => {
                    const date = new Date(h.changed_at).toLocaleString('ar-EG');
                    historyBody.innerHTML += `<tr><td>${h.field}</td><td>${h.old_val || '-'}</td><td>${h.new_val || '-'}</td><td>${h.changed_by}</td><td>${date}</td></tr>`;
                });
            } else { historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.7;">لا يوجد تغييرات مسجلة</td></tr>`; }
        } catch (e) { console.error('History Error:', e); }
    }

    document.getElementById('saveClientChangesBtn').addEventListener('click', async () => {
        const phones = [];
        document.querySelectorAll('#detailPhonesContainer .phone-row').forEach(row => {
            const num = row.querySelector('.phone-input').value.trim();
            const wa = row.querySelector('.phone-wa').checked;
            if (num) phones.push({ num, wa });
        });

        const updateData = {
            preferred_branch: document.getElementById('detailBranch').value, 
            assigned_specialist: document.getElementById('detailSpecialist').value,
            status: document.getElementById('detailStatus').value,
            phones: phones
        };

        try {
            const { error } = await db.from('clients').update(updateData).eq('id', currentDetailClientId);
            if (error) throw error;
            
            await db.from('history').insert([{ client_id: currentDetailClientId, field: 'تعديل بيانات', new_val: 'تم حفظ التعديلات', changed_by: currentUser }]);
            
            const newNote = document.getElementById('newNoteText').value;
            if (newNote.trim() !== '') {
                await db.from('history').insert([{ client_id: currentDetailClientId, field: 'ملاحظة جديدة', new_val: newNote, changed_by: currentUser }]);
            }
            
            showToast('تم حفظ التعديلات بنجاح', 'success'); 
            document.getElementById('newNoteText').value = ''; 
            await fetchHistory(currentDetailClientId); 
            fetchClients(currentPage, searchQuery); 
            fetchStats();
        } catch (err) { showToast('فشل حفظ التعديلات', 'error'); }
    });

    document.getElementById('bookAppointmentBtn').addEventListener('click', async () => {
        const appData = {
            client_id: currentDetailClientId,
            app_date: document.getElementById('appDate').value,
            app_time: document.getElementById('appTime').value,
            branch: document.getElementById('detailBranch').value,
            specialist: document.getElementById('appSpecialist').value,
            created_by: currentUser,
            status: 'مجدول'
        };
        if (!appData.app_date || !appData.app_time) return showToast('يرجى إدخال اليوم والساعة', 'warning');
        try {
            const { error } = await db.from('appointments').insert([appData]);
            if (error) throw error;
            await db.from('history').insert([{ client_id: currentDetailClientId, field: 'حجز موعد', new_val: `${appData.app_date} ${appData.app_time}`, changed_by: currentUser }]);
            showToast('تم حجز الموعد بنجاح', 'success');
            document.getElementById('appDate').value = ''; document.getElementById('appTime').value = '';
            fetchAppointments(currentDetailClientId); fetchHistory(currentDetailClientId);
        } catch (err) { showToast('فشل حجز الموعد', 'error'); }
    });

    async function fetchAppointments(clientId) {
        try {
            const { data, error } = await db.from('appointments').select('*').eq('client_id', clientId).order('app_date', { ascending: false });
            if (error) throw error;
            const list = document.getElementById('appointmentsList');
            list.innerHTML = '';
            if (data && data.length > 0) {
                list.innerHTML = `<h4 style="margin-bottom:10px; font-size:14px; color:#fff;">المواعيد القادمة:</h4>`;
                data.forEach(app => {
                    list.innerHTML += `<div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px;">
                        <strong>${new Date(app.app_date).toLocaleDateString('ar-EG')}</strong> - ${app.app_time || ''} <br>
                        <small>الأخصائي: ${app.specialist || '-'} | الحالة: ${app.status}</small>
                    </div>`;
                });
            }
        } catch (e) { console.error('Appointments Error:', e); }
    }

    // التنبيهات (Supabase)
    async function fetchNotifs() {
        try {
            const { data, error } = await db.from('notifications').select('*').or(`target_user.eq.${currentUser},target_user.eq.Admin`).order('created_at', { ascending: false }).limit(20);
            if (error) throw error;
            const unread = data.filter(n => !n.is_read).length;
            const badge = document.getElementById('notifBadge');
            badge.innerText = unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
            if (unread > lastUnreadCount) playBeep();
            lastUnreadCount = unread;
            
            const list = document.getElementById('notifList');
            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<div class="notif-item" style="text-align:center; opacity:0.7;">لا توجد تنبيهات</div>';
            } else {
                data.forEach(n => {
                    const date = new Date(n.created_at).toLocaleString('ar-EG');
                    list.innerHTML += `<div class="notif-item ${!n.is_read ? 'unread' : ''}" style="cursor: pointer;">
                        <p style="margin-bottom:5px;">${n.message}</p>
                        <small style="font-size: 11px; opacity: 0.7;">${date}</small>
                    </div>`;
                });
            }
        } catch (e) { console.error('Notif Error:', e); }
    }
    window.toggleNotifs = function() {
        const dropdown = document.getElementById('notifDropdown');
        if (dropdown.style.display === 'block') { dropdown.style.display = 'none'; } 
        else { dropdown.style.display = 'block'; window.markNotifsRead(); }
    };
    window.markNotifsRead = async function() {
        try {
            await db.from('notifications').update({ is_read: true }).or(`target_user.eq.${currentUser},target_user.eq.Admin`).eq('is_read', false);
            document.getElementById('notifBadge').style.display = 'none';
            lastUnreadCount = 0;
        } catch (e) { console.error(e); }
    };

    // الشات (Supabase)
    const chatModal = document.getElementById('chatModal');
    document.getElementById('chatBtn').addEventListener('click', async () => {
        chatModal.classList.add('active');
        try {
            const { data, error } = await db.from('users').select('*').neq('username', currentUser);
            if (error) throw error;
            const select = document.getElementById('chatTarget');
            select.innerHTML = '<option value="General">شات عام (للجميع)</option>';
            allUsersForMention = [];
            data.forEach(u => {
                const roleMap = { 'Admin': 'أدمن', 'Moderator': 'مودريتور', 'Secretary': 'سكرتارية' };
                const displayRole = roleMap[u.role] || 'موظف';
                select.innerHTML += `<option value="${u.username}">${u.username} (${u.job_title || displayRole})</option>`;
                allUsersForMention.push(u);
            });
        } catch (e) { console.error(e); }
        startChatPolling();
    });
    document.getElementById('closeChatModal').addEventListener('click', () => { chatModal.classList.remove('active'); clearInterval(chatPolling); });
    document.getElementById('chatTarget').addEventListener('change', fetchChat);

    async function fetchChat() {
        const target = document.getElementById('chatTarget').value;
        try {
            let query = db.from('chat').select('*');
            if (target === 'General') {
                query = query.eq('receiver', 'General');
            } else {
                query = query.or(`and(sender.eq.${currentUser},receiver.eq.${target}),and(sender.eq.${target},receiver.eq.${currentUser})`);
            }
            const { data, error } = await query.order('created_at', { ascending: true }).limit(50);
            if (error) throw error;
            const box = document.getElementById('chatBox');
            box.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(msg => {
                    const isMe = msg.sender === currentUser;
                    const time = new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                    let msgText = (msg.message || '').replace(/@(\w+)/g, '<span style="color:#ff9a44; font-weight:bold;">@$1</span>');
                    box.innerHTML += `<div class="chat-msg ${isMe ? 'me' : 'other'}"><div style="font-size: 11px; opacity: 0.8; margin-bottom: 4px;">${isMe ? 'أنت' : msg.sender} - ${time}</div>${msgText}</div>`;
                });
                box.scrollTop = box.scrollHeight;
            }
        } catch (e) { console.error('Chat Fetch Error:', e); }
    }
    function startChatPolling() { fetchChat(); clearInterval(chatPolling); chatPolling = setInterval(fetchChat, 3000); }

    document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        if (!msg) return;
        const target = document.getElementById('chatTarget').value;
        try {
            const { error } = await db.from('chat').insert([{ sender: currentUser, receiver: target, message: msg }]);
            if (error) throw error;
            if (target !== 'General') {
                await db.from('notifications').insert([{ target_user: target, message: `رسالة جديدة من ${currentUser}`, action_type: 'chat', action_id: currentUser }]);
            }
            input.value = '';
            document.getElementById('mentionDropdown').style.display = 'none';
            fetchChat(); fetchNotifs();
        } catch (err) { showToast('فشل إرسال الرسالة', 'error'); }
    });

    // التذاكر (Supabase)
    const ticketModal = document.getElementById('ticketModal');
    document.getElementById('ticketBtn').addEventListener('click', () => ticketModal.classList.add('active'));
    document.getElementById('closeTicketModal').addEventListener('click', () => ticketModal.classList.remove('active'));
    document.getElementById('ticketForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const btn = document.getElementById('submitTicketBtn');
        const btnText = btn.querySelector('.btn-text');
        const loader = document.getElementById('ticketLoader');
        const ticketData = {
            sender: currentUser,
            type: document.getElementById('ticketType').value,
            subject: document.getElementById('ticketSubject').value,
            message: document.getElementById('ticketMessage').value,
            status: 'مفتوحة'
        };
        btnText.style.display = 'none'; loader.style.display = 'block'; btn.disabled = true;
        try {
            const { error } = await db.from('tickets').insert([ticketData]);
            if (error) throw error;
            showToast('تم إرسال تذكرتك بنجاح', 'success'); 
            document.getElementById('ticketForm').reset(); 
            ticketModal.classList.remove('active'); 
        } catch (err) { showToast('فشل إرسال التذكرة', 'error'); }
        finally { btnText.style.display = 'inline'; loader.style.display = 'none'; btn.disabled = false; }
    });

    // لوحة الأدمن (Supabase)
    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');
    if (sessionStorage.getItem('userRole') === 'Admin') { adminBtn.style.display = 'flex'; }
    adminBtn.addEventListener('click', () => { adminModal.classList.add('active'); loadUsersForAdmin(); });
    document.getElementById('closeAdminModal').addEventListener('click', () => adminModal.classList.remove('active'));

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.getAttribute('data-tab')}`).classList.add('active');
        });
    });

    async function loadUsersForAdmin() {
        try {
            const { data, error } = await db.from('users').select('*');
            if (error) throw error;
            const select = document.getElementById('editUserSelect');
            select.innerHTML = '<option value="">-- اختر مستخدم من القائمة --</option>';
            allUsersForEdit = data || [];
            data.forEach(u => {
                const roleMap = { 'Admin': 'أدمن', 'Moderator': 'مودريتور', 'Secretary': 'سكرتارية' };
                const displayRole = roleMap[u.role] || 'موظف';
                select.innerHTML += `<option value="${u.id}">${u.username} (${u.job_title || displayRole})</option>`;
            });
        } catch (err) { showToast('فشل تحميل المستخدمين', 'error'); }
    }

    document.getElementById('editUserSelect').addEventListener('change', function() {
        const userId = this.value;
        const user = allUsersForEdit.find(u => u.id === userId);
        if (user) {
            document.getElementById('editUserId').value = user.id;
            document.getElementById('editUsername').value = user.username; 
            document.getElementById('editPassword').value = ''; 
            document.getElementById('editJobTitle').value = user.job_title || '';
            document.getElementById('editEmail
