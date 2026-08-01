// Which build is this? build.js writes build-flags.js next to app.js and the
// page loads it first; the Capacitor check is the belt-and-braces fallback for
// anyone loading these files directly. Everything that must not appear in the
// Play Store build — purchases, AI chat — hangs off this flag, and the markup
// for those regions is cut out of index.html at build time as well.
const IS_NATIVE = window.BUILD_TARGET === 'native'
    || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

// State
let audioData = [];
let pdfData = [];
let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
let recentlyPlayed = JSON.parse(localStorage.getItem('recentlyPlayed') || '[]');
let currentCategory = 'all';
let searchQuery = '';
let showFavoritesOnly = false;
let currentPlayerItem = null;
let currentUser = null;
let db = null;
let authMode = 'signin';
let wakeLock = null;
let listeningStats = JSON.parse(localStorage.getItem('listeningStats') || '{"plays":{},"total":0}');

// Config
const categoryIcons = {
    "জাদু": "🪄", "তাবেআ": "👤", "কারীন": "👥", "বদনজর": "🧿", "গিঁট ও বাঁধন": "🔗",
    "জ্বিন": "🔥", "অসুখ": "🏥", "সুরক্ষা": "🛡️", "আমল": "📿", "শিক্ষা": "🎓", "পারিবারিক": "🏠", "গাইড": "📜"
};

// DOM
const audioContainer = document.getElementById('audio-container');
const pdfContainer = document.getElementById('pdf-container');
const categoryFilters = document.getElementById('category-filters');
const searchInput = document.getElementById('search-input');
const themeToggle = document.getElementById('theme-toggle');
const favoriteToggleBtn = document.getElementById('favorite-toggle-btn');
const navButtons = document.querySelectorAll('.nav-item');

// Sections used to be switched inside the nav-button handler, which meant only
// a section with a button could ever be opened. The blog has no bottom-nav slot
// (five is already tight on a phone), so switching lives here instead and the
// nav buttons just call it.
window.showSection = function(section) {
    document.querySelectorAll('#main-content > div').forEach(div => div.classList.add('hidden'));
    document.getElementById(`section-${section}`)?.classList.remove('hidden');
    navButtons.forEach(b => b.classList.toggle('active', b.dataset.section === section));
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
const toast = document.getElementById('toast');

async function init() {
    showSkeleton();
    try {
        const [audioRes, pdfRes] = await Promise.all([
            fetch('audio.json'),
            fetch('pdf_list.json')
        ]);
        audioData = await audioRes.json();
        pdfData = await pdfRes.json();

        const statAudio = document.getElementById('stat-audio-count-home');
        const statPdf = document.getElementById('stat-pdf-count-home');
        if (statAudio) statAudio.innerText = `${audioData.length}+`;
        if (statPdf) statPdf.innerText = `${pdfData.length}+`;

        setupCategories();
        renderAudio();
        renderPDFs();
        loadBlog();               // network-bound; don't hold up first paint
        renderRecentlyPlayed();
        setupEventListeners();
        setupTheme();
        registerServiceWorker();
        initFirebase();
        loadYouTubeAPI();
        initVoiceSearch();
        updateNotifBtn();
        checkForNewContent();
        checkDailyReminder();
        renderDailySection();
        renderCourses();
        renderBooks();
        refreshBookRatings();     // fills in the star rating once Firestore answers
        updatePlayerModeButtons();
        initOnboarding();
        // Kept out of the shared catch: a plugin problem here has nothing to do
        // with loading the catalogue, and must not surface as "তথ্য লোড করা যায়নি"।
        try { initNativeShell(); } catch (e) { console.warn('Native shell init failed:', e); }
    } catch (e) {
        audioContainer.innerHTML = '<p class="text-red-500 text-center py-10">তথ্য লোড করা যায়নি!</p>';
    }
}

function setupCategories() {
    const categories = ['all', ...new Set(audioData.map(item => item.category))];
    categoryFilters.innerHTML = categories.map(cat => {
        const count = cat === 'all' ? audioData.length : audioData.filter(i => i.category === cat).length;
        const icon = cat === 'all' ? '✦' : (categoryIcons[cat] || '•');
        const label = cat === 'all' ? 'সবগুলো' : cat;
        const isActive = (cat === currentCategory && !showFavoritesOnly);
        return `
            <button class="chip ${isActive ? 'active' : ''}" data-category="${cat}">
                <span>${icon}</span>
                <span>${label}</span>
                <span class="chip-count">${count}</span>
            </button>
        `;
    }).join('');

    document.querySelectorAll('.chip[data-category]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            currentCategory = e.currentTarget.dataset.category;
            showFavoritesOnly = false;
            updateCategoryUI();
            renderAudio();
        });
    });
}

function updateCategoryUI() {
    document.querySelectorAll('.chip[data-category]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === currentCategory && !showFavoritesOnly);
    });
    if (favoriteToggleBtn) {
        favoriteToggleBtn.style.borderColor = showFavoritesOnly ? '#fbbf24' : '';
        favoriteToggleBtn.style.color = showFavoritesOnly ? '#fbbf24' : '';
    }
}

function renderAudio() {
    let filtered = audioData.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = item.title_bn.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             item.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
        const isFavorite = favorites.includes(item.code);
        if (showFavoritesOnly) return isFavorite && matchesSearch;
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        audioContainer.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px">
                <div style="font-size:2.5rem;margin-bottom:12px">🔍</div>
                <p style="color:var(--text-sub);font-size:0.95rem">কোনো ফলাফল পাওয়া যায়নি!</p>
            </div>`;
        return;
    }

    audioContainer.innerHTML = filtered.map((item, idx) => {
        const isFav = favorites.includes(item.code);
        return `
            <div class="audio-card card-animate" style="animation-delay:${idx * 30}ms">
                <div class="audio-card-top">
                    <div class="audio-card-meta">
                        <span class="code-badge">${item.code}</span>
                        <span class="cat-label">${item.category}</span>
                    </div>
                    <button onclick="toggleFavorite('${item.code}')" class="fav-btn ${isFav ? 'on' : ''}">${isFav ? '⭐' : '☆'}</button>
                </div>
                <div>
                    <h3 class="audio-title">${item.title_bn}</h3>
                    ${item.title_ar ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><p class="audio-title-ar" style="flex:1">${item.title_ar}</p><button onclick="copyArabic(decodeURIComponent('${encodeURIComponent(item.title_ar)}'));haptic(8)" class="btn-action-sm" style="width:30px;height:28px;flex-shrink:0" title="আরবি কপি"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button></div>` : ''}
                </div>
                <div class="audio-tags">
                    ${item.tags.map(t => `<span class="tag">${t}</span>`).join('')}
                </div>
                <div class="audio-card-actions">
                    <button onclick="openPlayer('${item.code}')" class="btn-play">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        শুনুন
                    </button>
                    <button onclick="shareWhatsApp('${item.code}',decodeURIComponent('${encodeURIComponent(item.title_bn)}'),'${item.url}')" class="btn-action-sm wa" title="WhatsApp শেয়ার">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.118 1.524 5.847L.057 23.5l5.797-1.521A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.89a9.875 9.875 0 01-5.031-1.378l-.36-.214-3.742.981.998-3.648-.235-.374A9.861 9.861 0 012.11 12C2.11 6.578 6.578 2.11 12 2.11S21.89 6.578 21.89 12 17.422 21.89 12 21.89z"/></svg>
                    </button>
                    <button onclick="openAddToPlaylist('${item.code}')" class="btn-action-sm pl" title="Playlist-এ যোগ">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                    </button>
                    <button onclick="copyLink('${item.url}')" class="btn-action-sm" title="লিঙ্ক কপি">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    </button>
                    ${isDownloadable(item) ? `
                    <button onclick="toggleTrackDownload('${item.code}')"
                            class="btn-action-sm dl ${downloadedAudio.includes(item.code) ? 'on' : ''}"
                            title="${downloadedAudio.includes(item.code) ? 'অফলাইনে সেভ আছে' : 'অফলাইনে সেভ করুন'}">
                        ${downloadedAudio.includes(item.code)
                            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>'
                            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></svg>'}
                    </button>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderPDFs() {
    pdfContainer.innerHTML = pdfData.map(pdf => {
        const bmKey = `bm_${pdf.filename}`;
        const saved = pdfBookmarks[pdf.filename];
        const inputId = `bm-input-${pdf.filename.replace(/[^a-z0-9]/gi,'_')}`;
        const savedId = `bm-saved-${pdf.filename.replace(/[^a-z0-9]/gi,'_')}`;
        return `
        <div class="pdf-card">
            <div class="pdf-card-header">
                <div class="pdf-card-icon">${categoryIcons[pdf.category] || '📄'}</div>
                <div class="mn-0">
                    <p class="pdf-card-title clamp2">${pdf.title_bn}</p>
                    <p class="pdf-card-cat">${pdf.category}</p>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px">
                <button onclick="viewPDF('pdf/${pdf.filename}', '${pdf.title_bn.replace(/'/g, "\\'")}'${saved ? `,${saved}` : ''})" class="btn-pdf">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    পড়ুন${saved ? ` (পেজ ${saved})` : ''}
                </button>
            </div>
            <div class="pdf-bm-row">
                <input id="${inputId}" type="number" min="1" placeholder="পেজ নম্বর..." class="pdf-bm-input" value="${saved || ''}">
                <button onclick="savePdfBookmark('${pdf.filename}','${inputId}')" class="pdf-bm-btn">📌 সেভ</button>
                <span id="bm-saved-${pdf.filename.replace(/[^a-z0-9]/gi,'_')}" class="pdf-bm-saved">${saved ? `📌 পেজ ${saved}` : ''}</span>
            </div>
        </div>`;
    }).join('');
}

window.viewPDF = (url, title) => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    const modalTitle = document.getElementById('pdf-modal-title');
    modalTitle.innerText = title;
    frame.src = url;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closePDF = () => {
    const modal = document.getElementById('pdf-modal');
    const frame = document.getElementById('pdf-frame');
    modal.classList.add('hidden');
    frame.src = '';
    document.body.style.overflow = 'auto';
};

window.toggleFavorite = (code) => {
    if (favorites.includes(code)) favorites = favorites.filter(c => c !== code);
    else favorites.push(code);
    localStorage.setItem('favorites', JSON.stringify(favorites));
    saveToCloud('favorites', favorites);
    updatePlayerFavBtn();
    renderAudio();
};

window.copyLink = (url) => {
    navigator.clipboard.writeText(url).then(() => showToast('লিংক কপি হয়েছে!'));
};

function setupEventListeners() {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderAudio();
    });
    themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        updateThemeIcons(document.documentElement.classList.contains('dark'));
    });
    if (favoriteToggleBtn) {
        favoriteToggleBtn.addEventListener('click', () => {
            showFavoritesOnly = !showFavoritesOnly;
            if (showFavoritesOnly) currentCategory = 'all';
            updateCategoryUI();
            renderAudio();
            document.querySelector('.nav-item[data-section="library"]')?.click();
        });
    }
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => showSection(btn.dataset.section));
    });

    const searchToggle = document.getElementById('search-toggle');
    if (searchToggle) searchToggle.addEventListener('click', showSearchOverlay);

    const globalSearchInput = document.getElementById('global-search-input');
    if (globalSearchInput) globalSearchInput.addEventListener('input', (e) => renderSearchResults(e.target.value));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSearchOverlay();
            closePlayer();
            closeLoginModal();
        }
    });

    setupSwipeGestures();
}

function setupTheme() {
    const isDark = localStorage.getItem('theme') !== 'light';
    document.documentElement.classList.toggle('dark', isDark);
    updateThemeIcons(isDark);
}

function updateThemeIcons(isDark) {
    document.getElementById('theme-toggle-dark-icon').classList.toggle('hidden', isDark);
    document.getElementById('theme-toggle-light-icon').classList.toggle('hidden', !isDark);
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(msg) {
    toast.textContent = msg || '✅ সম্পন্ন!';
    toast.classList.add('opacity-100');
    setTimeout(() => toast.classList.remove('opacity-100'), 2000);
}

// ── Skeleton Loading ────────────────────────────────────────────────────────
function showSkeleton() {
    const card = () => `
        <div class="audio-card" style="gap:14px">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div class="skeleton" style="height:18px;width:52px;border-radius:6px"></div>
                <div class="skeleton" style="height:18px;width:24px;border-radius:6px"></div>
            </div>
            <div>
                <div class="skeleton" style="height:18px;width:75%;border-radius:6px;margin-bottom:8px"></div>
                <div class="skeleton" style="height:13px;width:50%;border-radius:6px"></div>
            </div>
            <div style="display:flex;gap:6px">
                <div class="skeleton" style="height:22px;width:52px;border-radius:100px"></div>
                <div class="skeleton" style="height:22px;width:66px;border-radius:100px"></div>
                <div class="skeleton" style="height:22px;width:44px;border-radius:100px"></div>
            </div>
            <div class="skeleton" style="height:40px;width:100%;border-radius:12px"></div>
        </div>
    `;
    audioContainer.innerHTML = Array(6).fill(card()).join('');
}

// ── Swipe Gesture Navigation ────────────────────────────────────────────────
function setupSwipeGestures() {
    // Must match the nav buttons that actually exist in this build — the
    // native build strips the Diagnosis and AI Chat tabs, and swiping to a
    // section with no button would strand the user on a blank screen.
    const sections = IS_NATIVE
        ? ['home', 'library', 'pdf']
        : ['home', 'library', 'pdf', 'prescriptions', 'chat'];
    let touchStartX = 0, touchStartY = 0;
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainContent.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

        const activeBtn = document.querySelector('.nav-item.active') || navButtons[0];
        const currentSection = activeBtn?.dataset?.section || 'home';
        const idx = sections.indexOf(currentSection);
        let nextIdx = idx;
        if (dx < 0 && idx < sections.length - 1) nextIdx = idx + 1;
        else if (dx > 0 && idx > 0) nextIdx = idx - 1;
        if (nextIdx === idx) return;

        const targetBtn = document.querySelector(`.nav-item[data-section="${sections[nextIdx]}"]`);
        if (targetBtn) targetBtn.click();
    }, { passive: true });
}

// ── Recently Played ─────────────────────────────────────────────────────────
function addToRecentlyPlayed(code) {
    recentlyPlayed = recentlyPlayed.filter(c => c !== code);
    recentlyPlayed.unshift(code);
    recentlyPlayed = recentlyPlayed.slice(0, 5);
    localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
    saveToCloud('recentlyPlayed', recentlyPlayed);
    renderRecentlyPlayed();
}

function renderRecentlyPlayed() {
    const section = document.getElementById('recently-played-section');
    const list = document.getElementById('recently-played-list');
    if (!section || !list) return;
    if (recentlyPlayed.length === 0 || audioData.length === 0) { section.classList.add('hidden'); return; }

    const items = recentlyPlayed.map(code => audioData.find(a => a.code === code)).filter(Boolean);
    if (items.length === 0) { section.classList.add('hidden'); return; }

    section.classList.remove('hidden');
    list.innerHTML = items.map(item => `
        <div class="recent-item" onclick="openPlayer('${item.code}')">
            <div class="recent-icon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div class="mn-0" style="flex:1">
                <p class="recent-title clamp1">${item.title_bn}</p>
                <p class="recent-meta">${item.code} · ${item.category}</p>
            </div>
            <svg class="recent-play" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
    `).join('');
}

// ── YouTube Player ──────────────────────────────────────────────────────────
function getYouTubeId(url) {
    const match = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?#]+)/);
    return match ? match[1] : null;
}

// openPlayer / closePlayer live further down, next to the YouTube-API,
// native-audio and progress-tracking state they depend on. They used to be
// defined here too and then replaced wholesale, which left two dead copies.

function updatePlayerFavBtn() {
    const btn = document.getElementById('yt-fav-btn');
    if (!btn || !currentPlayerItem) return;
    btn.textContent = favorites.includes(currentPlayerItem.code) ? '⭐' : '☆';
}

window.toggleFavoriteFromPlayer = () => {
    if (currentPlayerItem) window.toggleFavorite(currentPlayerItem.code);
};

window.copyLinkFromPlayer = () => {
    if (currentPlayerItem) window.copyLink(currentPlayerItem.url);
};

window.openExternalPlayer = () => {
    if (currentPlayerItem) openExternal(currentPlayerItem.url);
};

// ── Global Search ───────────────────────────────────────────────────────────
function showSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('global-search-input')?.focus(), 100);
    renderSearchResults('');
}

function closeSearchOverlay() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
    document.body.style.overflow = 'auto';
}

window.closeSearchOverlay = closeSearchOverlay;

function renderSearchResults(query) {
    const container = document.getElementById('global-search-results');
    if (!container) return;

    if (!query.trim()) {
        container.innerHTML = `<div class="search-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 10px;display:block;color:var(--text-dim)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            কী খুঁজছেন লিখুন...
        </div>`;
        return;
    }

    const q = query.toLowerCase();
    const audioResults = audioData.filter(item =>
        item.title_bn.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
    );
    const pdfResults = pdfData.filter(pdf =>
        pdf.title_bn.toLowerCase().includes(q) ||
        (pdf.category || '').toLowerCase().includes(q)
    );

    if (audioResults.length === 0 && pdfResults.length === 0) {
        container.innerHTML = `<div class="search-empty">কোনো ফলাফল পাওয়া যায়নি</div>`;
        return;
    }

    let html = '';
    if (audioResults.length > 0) {
        html += `<p class="search-section-label">🎵 অডিও (${audioResults.length})</p>`;
        html += audioResults.map(item => `
            <div class="search-result-item" onclick="closeSearchOverlay(); openPlayer('${item.code}')">
                <div class="search-result-icon" style="background:var(--green-dim);color:var(--green)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="mn-0">
                    <p class="clamp1" style="font-size:0.875rem;font-weight:600">${item.title_bn}</p>
                    <p style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">${item.code} · ${item.category}</p>
                </div>
            </div>
        `).join('');
    }
    if (pdfResults.length > 0) {
        html += `<p class="search-section-label" style="margin-top:20px">📄 পিডিএফ (${pdfResults.length})</p>`;
        html += pdfResults.map(pdf => `
            <div class="search-result-item" onclick="closeSearchOverlay(); viewPDF('pdf/${pdf.filename}', '${pdf.title_bn.replace(/'/g, "\\'")}')">
                <div class="search-result-icon" style="background:var(--raised);font-size:1.1rem">📄</div>
                <div class="mn-0">
                    <p class="clamp1" style="font-size:0.875rem;font-weight:600">${pdf.title_bn}</p>
                    <p style="font-size:0.72rem;color:var(--text-dim);margin-top:2px">${pdf.category}</p>
                </div>
            </div>
        `).join('');
    }
    container.innerHTML = html;
}

// ── Firebase Auth ───────────────────────────────────────────────────────────
function initFirebase() {
    if (typeof firebase === 'undefined' || typeof FIREBASE_CONFIG === 'undefined') return;
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        db = firebase.firestore();
        if (IS_NATIVE) {
            // Firestore's default WebChannel transport is unreliable inside an
            // Android WebView — reads can hang open forever instead of failing.
            // Long-polling is slower to start but actually completes.
            try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); }
            catch (e) { console.warn('Firestore transport setting failed:', e); }
        }
        firebase.auth().onAuthStateChanged(handleAuthStateChange);
        const authBtn = document.getElementById('auth-btn');
        if (authBtn) authBtn.classList.remove('hidden');
    } catch (e) {
        console.warn('Firebase init failed:', e);
    }
}

async function handleAuthStateChange(user) {
    currentUser = user;
    const authBtn = document.getElementById('auth-btn');
    const avatarBtn = document.getElementById('user-avatar-btn');
    const userPhoto = document.getElementById('user-photo');
    const userInitials = document.getElementById('user-initials');
    const dropdownPhoto = document.getElementById('dropdown-photo');
    const dropdownInitials = document.getElementById('dropdown-initials');
    const dropdownName = document.getElementById('dropdown-name');
    const dropdownEmail = document.getElementById('dropdown-email');
    const initial = (user?.displayName || user?.email || 'U')[0].toUpperCase();

    if (user) {
        if (authBtn) authBtn.classList.add('hidden');
        if (avatarBtn) avatarBtn.classList.remove('hidden');
        // Admin FAB
        const fab = document.getElementById('admin-fab');
        if (fab) fab.style.display = user.email === ADMIN_EMAIL ? 'flex' : 'none';
        // Auto-open patient form if pending
        if (pendingPatientFormOpen && user.email !== ADMIN_EMAIL) {
            pendingPatientFormOpen = false;
            setTimeout(openPatientForm, 400);
        }
        if (user.photoURL) {
            if (userPhoto) { userPhoto.src = user.photoURL; userPhoto.classList.remove('hidden'); }
            if (userInitials) userInitials.classList.add('hidden');
            if (dropdownPhoto) { dropdownPhoto.src = user.photoURL; dropdownPhoto.classList.remove('hidden'); }
            if (dropdownInitials) dropdownInitials.classList.add('hidden');
        } else {
            if (userInitials) { userInitials.textContent = initial; userInitials.classList.remove('hidden'); }
            if (userPhoto) userPhoto.classList.add('hidden');
            if (dropdownInitials) { dropdownInitials.textContent = initial; dropdownInitials.classList.remove('hidden'); }
            if (dropdownPhoto) dropdownPhoto.classList.add('hidden');
        }
        if (dropdownName) dropdownName.textContent = user.displayName || 'ব্যবহারকারী';
        if (dropdownEmail) dropdownEmail.textContent = user.email || '';
        closeLoginModal();
        await loadUserProfile(user);
        await syncFromCloud(user);
        renderCourses();
        renderBooks();
        watchUnlocks(user);
    } else {
        if (authBtn) authBtn.classList.remove('hidden');
        if (avatarBtn) avatarBtn.classList.add('hidden');
        const fab = document.getElementById('admin-fab');
        if (fab) fab.style.display = 'none';
        stopWatchingUnlocks();
        renderBooks();   // drop back to the buy/preview state
    }
}

// Live-unlock: without this the buyer keeps seeing "কিনুন" until they restart
// the app, even though the server already serves them the pages. Listening to
// their own user doc means the admin's ✅ Confirm lands on their screen at once.
let unlockUnsub = null;

function watchUnlocks(user) {
    stopWatchingUnlocks();
    if (!db || !user) return;
    let first = true;
    unlockUnsub = db.collection('users').doc(user.uid).onSnapshot((doc) => {
        if (!doc.exists) return;
        const before = ownedIds();
        userProfile = doc.data();
        applyPersonalization();
        const now = ownedIds();
        const fresh = [...now].filter(id => !before.has(id));
        const lost  = [...before].filter(id => !now.has(id));
        if (first) { first = false; return; }        // the initial read isn't news
        if (lost.length) {
            // The admin rejected an auto-unlocked payment while they were reading.
            renderCourses();
            renderBooks();
            const readerOpen = !document.getElementById('book-reader')?.classList.contains('hidden');
            if (readerOpen && lost.includes(readerBook?.id)) {
                showToast('⚠️ পেমেন্ট যাচাই হয়নি — অ্যাক্সেস বাতিল করা হয়েছে');
                showReaderPage();
            }
        }
        if (!fresh.length) return;                   // some other profile field moved
        renderCourses();
        renderBooks();
        for (const id of fresh) {
            const item = ALL_PRODUCTS().find(p => p.id === id);
            if (!item) continue;
            haptic(20);
            showToast(`✅ পেমেন্ট নিশ্চিত — "${item.title}" আনলক হয়েছে!`);
            // if they are sitting on the "preview over" screen, open the page now
            const readerOpen = !document.getElementById('book-reader')?.classList.contains('hidden');
            if (readerOpen && readerBook?.id === id) showReaderPage();
        }
    }, (e) => console.warn('Unlock listener error:', e));
}

function stopWatchingUnlocks() {
    if (unlockUnsub) { unlockUnsub(); unlockUnsub = null; }
}

async function syncFromCloud(user) {
    if (!db || !user) return;
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            if (data.favorites) {
                favorites = data.favorites;
                localStorage.setItem('favorites', JSON.stringify(favorites));
                renderAudio();
            }
            if (data.recentlyPlayed) {
                recentlyPlayed = data.recentlyPlayed;
                localStorage.setItem('recentlyPlayed', JSON.stringify(recentlyPlayed));
                renderRecentlyPlayed();
            }
        }
    } catch (e) {
        console.warn('Cloud sync failed:', e);
    }
}

async function saveToCloud(key, value) {
    if (!db || !currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).set({ [key]: value }, { merge: true });
    } catch (e) {
        console.warn('Cloud save failed:', e);
    }
}

let userProfile = null;   // loaded from Firestore users/{uid}
let _authTab = 'login';

// ── Auth Tab Switching ───────────────────────────────────
window.setAuthTab = function(tab) {
    _authTab = tab;
    document.getElementById('tab-login')?.classList.toggle('active', tab === 'login');
    document.getElementById('tab-signup')?.classList.toggle('active', tab === 'signup');
    document.getElementById('auth-login-section')?.classList.toggle('hidden', tab !== 'login');
    document.getElementById('auth-signup-section')?.classList.toggle('hidden', tab !== 'signup');
};

// ── Google Login ─────────────────────────────────────────
//
// signInWithPopup cannot work inside a Capacitor WebView: there is no popup to
// open, and the WebView's origin (https://localhost) is not in Firebase's
// authorized-domain list. The native path needs @capacitor-firebase/
// authentication, which in turn needs google-services.json and the SHA-1/SHA-256
// of both the debug keystore and the Play App Signing certificate registered in
// the Firebase console. Until those exist the plugin is absent and we say so
// plainly rather than throwing an opaque auth error.
async function newGoogleUserProfile(user) {
    await saveUserProfile(user, {
        name: user.displayName || '',
        email: user.email,
        phone: '',
        age: '', gender: '', location: '',
        problemTypes: [],
        courses: [],
    });
}

window.signInWithGoogle = async () => {
    if (typeof firebase === 'undefined') return;

    if (IS_NATIVE) {
        const FirebaseAuth = nativePlugin('FirebaseAuthentication');
        if (!FirebaseAuth) {
            showAuthError('এই অ্যাপে আপাতত Google দিয়ে সাইন-ইন করা যাচ্ছে না। ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন।');
            return;
        }
        try {
            const { credential } = await FirebaseAuth.signInWithGoogle();
            const cred = firebase.auth.GoogleAuthProvider.credential(credential.idToken, credential.accessToken);
            const result = await firebase.auth().signInWithCredential(cred);
            if (result.additionalUserInfo?.isNewUser) await newGoogleUserProfile(result.user);
        } catch (e) { showAuthError(e.message); }
        return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await firebase.auth().signInWithPopup(provider);
        if (result.additionalUserInfo?.isNewUser) await newGoogleUserProfile(result.user);
    } catch (e) { showAuthError(e.message); }
};

// ── Email Login ──────────────────────────────────────────
window.doEmailLogin = async function() {
    const email    = document.getElementById('auth-email')?.value?.trim();
    const password = document.getElementById('auth-password')?.value;
    if (!email || !password) { showAuthError('ইমেইল ও পাসওয়ার্ড দিন'); return; }
    try {
        showAuthError('');
        await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (e) {
        const msgs = {
            'auth/user-not-found': 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই',
            'auth/wrong-password': 'পাসওয়ার্ড ভুল হয়েছে',
            'auth/invalid-email': 'ইমেইল ঠিকানা সঠিক নয়',
            'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন',
        };
        showAuthError(msgs[e.code] || e.message);
    }
};

// ── Email Signup ─────────────────────────────────────────
window.doEmailSignup = async function() {
    const email    = document.getElementById('su-email')?.value?.trim();
    const password = document.getElementById('su-password')?.value;
    const pass2    = document.getElementById('su-password2')?.value;
    const name     = document.getElementById('su-name')?.value?.trim();
    const phone    = document.getElementById('su-phone')?.value?.trim();
    const age      = document.getElementById('su-age')?.value;
    const gender   = document.getElementById('su-gender')?.value;
    const location = document.getElementById('su-location')?.value?.trim();

    const suError = el => { document.getElementById('su-error').textContent = el; };

    if (!email)    { suError('ইমেইল দিন'); return; }
    if (!password) { suError('পাসওয়ার্ড দিন'); return; }
    if (password.length < 6) { suError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'); return; }
    if (password !== pass2) { suError('দুটি পাসওয়ার্ড মিলছে না'); return; }
    if (!name)     { suError('নাম দিন'); return; }
    if (!phone)    { suError('WhatsApp নম্বর দিন'); return; }

    const problemTypes = [...document.querySelectorAll('#su-problem-mini .su-chip.checked')].map(c => c.textContent.trim());

    suError('');
    try {
        const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        await saveUserProfile(cred.user, { name, email, phone, age, gender, location, problemTypes, courses: [] });
    } catch(e) {
        const msgs = {
            'auth/email-already-in-use': 'এই ইমেইলে ইতিমধ্যে অ্যাকাউন্ট আছে — Login করুন',
            'auth/invalid-email': 'ইমেইল ঠিকানা সঠিক নয়',
            'auth/weak-password': 'পাসওয়ার্ড আরও শক্তিশালী করুন',
        };
        suError(msgs[e.code] || e.message);
    }
};

window.toggleSuChip = function(el) { el.classList.toggle('checked'); };

// ── User Profile ─────────────────────────────────────────
async function saveUserProfile(user, data) {
    if (!db) return;
    try {
        await db.collection('users').doc(user.uid).set({
            ...data,
            uid: user.uid,
            joinedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        userProfile = data;
    } catch(e) { console.warn('Profile save error:', e); }
}

async function loadUserProfile(user) {
    if (!db) return;
    try {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            applyPersonalization();
        }
    } catch(e) { console.warn('Profile load error:', e); }
}

function applyPersonalization() {
    if (!userProfile) return;
    // Show user name in profile button tooltip
    const avatarBtn = document.getElementById('avatar-btn');
    if (avatarBtn && userProfile.name) avatarBtn.title = userProfile.name;
    // Firestore is the source of truth for what a signed-in user owns. Mirror it
    // into localStorage so the UI still works offline, but *drop* products it no
    // longer lists — a merge would keep showing "বইটি পড়ুন" after the admin
    // rejected an auto-unlock, on a book whose pages the server now refuses.
    // Ids that aren't products (older/unknown grants) are left alone.
    const remote = userProfile.courses || [];
    const known = new Set(ALL_PRODUCTS().map(p => p.id));
    const local = JSON.parse(localStorage.getItem('purchasedCourses') || '[]');
    const merged = [...new Set([...local.filter(id => !known.has(id) || remote.includes(id)), ...remote])];
    if (JSON.stringify(merged) !== JSON.stringify(local)) {
        localStorage.setItem('purchasedCourses', JSON.stringify(merged));
    }
    renderCourses();
    renderBooks();
    // Show personalized welcome on first load
    if (userProfile.name && !sessionStorage.getItem('welcomed')) {
        sessionStorage.setItem('welcomed', '1');
        setTimeout(() => showToast(`স্বাগতম, ${userProfile.name.split(' ')[0]}! 👋`), 1200);
    }
}

// ── Password Reset ────────────────────────────────────────
window.resetPassword = async () => {
    const email = document.getElementById('auth-email')?.value?.trim();
    if (!email) { showAuthError('রিসেটের জন্য ইমেইল দিন'); return; }
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        showAuthError('✅ রিসেট লিংক পাঠানো হয়েছে — ইমেইল চেক করুন');
    } catch(e) { showAuthError(e.message); }
};

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (el) el.textContent = msg;
}

window.signOutUser = async () => {
    if (typeof firebase !== 'undefined') await firebase.auth().signOut();
    userProfile = null;
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
};

window.openLoginModal = (tab = 'login') => {
    setAuthTab(tab);
    const modal = document.getElementById('login-modal');
    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
};

window.closeLoginModal = () => {
    const modal = document.getElementById('login-modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = 'auto'; }
};

window.toggleProfileDropdown = () => {
    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
};

// ══════════════════════════════════════════════════════════
// COURSES & PAYMENT
// ══════════════════════════════════════════════════════════
// Supplied by payments.js, which only the web build copies. In the APK these
// are undefined and every purchase path is gated off — see IS_NATIVE.
const PAYMENT_BKASH  = window.PAYMENT_BKASH;
const PAYMENT_NAGAD  = window.PAYMENT_NAGAD;
const PAYMENT_ROCKET = window.PAYMENT_ROCKET;

const COURSES = [
    {
        id: 'diagnosis-guideline',
        emoji: 'steth',
        title: 'রুকিয়াহ ডায়াগনোসিস ও গাইডলাইন',
        desc: '২৫০+ প্রশ্নভিত্তিক বিস্তারিত মূল্যায়নের মাধ্যমে আপনার জন্য প্রস্তুত করা হবে একটি ব্যক্তিগতকৃত রুকিয়াহ পরিকল্পনা।',
        price: 300, originalPrice: 500,
        features: [
            'বিস্তারিত লক্ষণ বিশ্লেষণ',
            'ব্যক্তিগতকৃত প্রেসক্রিপশন',
            'প্রয়োজনীয় রুকিয়াহ অডিও',
            'দৈনিক ও সাপ্তাহিক আমল',
            'মানসিক দিকনির্দেশনা',
            '৪৫ দিনের ফলোআপ',
            'প্রয়োজনীয় সতর্কতা',
            'ব্যক্তিগতকৃত গাইডলাইন',
        ],
        badge: 'বিশেষজ্ঞ সেরা', badgeIcon: 'star', badgeColor: 'var(--green)',
        formLink: 'https://forms.gle/Wo89U8m5HWjt824e6',
        fbLink: 'https://www.facebook.com/al.quranic.ruqyah.healing1',
    },
];

// In the Capacitor/APK build the page is served from a local web server, so a
// relative /api URL would resolve to the device instead of the deployment.
const API_BASE = (IS_NATIVE || location.protocol === 'file:')
    ? 'https://alquranicruqyahhealing.com'
    : '';

// Books are sold through the same bKash/Nagad flow as courses, but their pages
// are delivered by the gated /api/book function — never as a static file.
const BOOKS = [
    {
        id: 'shekhar-shilpo',
        title: 'শেখার শিল্প',
        subtitle: 'পর্ব ১ — পড়ালেখা: শেখার আধুনিক বিজ্ঞান',
        author: 'রাকী ফয়সাল আহমেদ সাবিত',
        desc: 'পড়েও মনে থাকে না, বা পড়তে বসলেই মন উড়ে যায়? শেখার আধুনিক বিজ্ঞান — active recall, spaced repetition, mind map, deep work — হাতে ধরে শেখানো, সাথে ইলম ও রুকইয়াহর আমল।',
        tags: ['৩১৮ পাতা', 'বাংলা', 'ইলম ও রুকইয়াহ অংশসহ'],
        price: 200, originalPrice: 500,
    },
];

// Inline line-icons, so buttons can carry an icon that inherits the text colour
// instead of an emoji that renders differently on every device.
const ICON = {
    cart:  '<path d="M2 3h2.2l2.1 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L20 7H5.3"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/>',
    eye:   '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    book:  '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3Z"/>',
    steth: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M6 3H4.5M14 3h1.5"/><path d="M10 12v2a5 5 0 0 0 5 5 4 4 0 0 0 4-4v-1"/><circle cx="19" cy="12" r="2"/>',
    star:  '<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z"/>',
};
const ico = (name, size = '1em') =>
    `<svg class="ico" style="width:${size};height:${size}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

const ALL_PRODUCTS = () => [...COURSES, ...BOOKS];
const ownedIds = () => {
    const local = JSON.parse(localStorage.getItem('purchasedCourses') || '[]');
    const remote = currentUser ? (userProfile?.courses || []) : [];
    return new Set([...local, ...remote]);
};

let currentBuyCourse = null;
let currentPayMethod = 'bkash';

// TrxIDs get retyped by hand from an SMS, so compare them case- and
// space-insensitively — otherwise "8n7 a2k9lp" and "8N7A2K9LP" read as two
// different payments and the same money unlocks the book twice.
function normalizeTxid(raw) {
    return String(raw || '').replace(/[\s-]/g, '').toUpperCase();
}

// One bKash payment buys one thing, so a TrxID that already unlocked something
// must not unlock a second copy on its own — that submission waits for the
// admin instead. Reading other people's purchases may be admin-only under the
// Firestore rules, so a blocked query is NOT read as "clean": the row still
// reaches the dashboard carrying its duplicate-TrxID warning.
async function txidAlreadySpent(txid) {
    if (!db || !txid) return false;
    try {
        const snap = await db.collection('purchases').where('txid', '==', txid).get();
        return snap.docs.some(d => ['confirmed', 'auto'].includes(d.data().status));
    } catch (e) {
        console.warn('TrxID reuse check skipped:', e.message);
        return false;
    }
}

// Firestore first: /api/book reads users/<uid>.courses to decide whether to
// hand over a page, so a local-only grant would show "বইটি পড়ুন" on a book
// whose pages still come back 403. If the write throws, nothing is granted.
async function grantProduct(uid, productId) {
    if (db && uid) {
        await db.collection('users').doc(uid).set({
            courses: firebase.firestore.FieldValue.arrayUnion(productId),
        }, { merge: true });
    }
    const local = JSON.parse(localStorage.getItem('purchasedCourses') || '[]');
    if (!local.includes(productId)) {
        local.push(productId);
        localStorage.setItem('purchasedCourses', JSON.stringify(local));
    }
    renderCourses();
    renderBooks();
}

function renderBooks() {
    const el = document.getElementById('books-container');
    if (!el) return;
    const owned = ownedIds();

    el.innerHTML = BOOKS.map(b => {
        const has = owned.has(b.id);
        const disc = Math.round((1 - b.price / b.originalPrice) * 100);
        return `
        <div class="book-card">
            <div class="book-cover">
                <img src="${API_BASE}/api/book?thumb=1" alt="${b.title}" loading="lazy"
                     onerror="this.parentElement.style.display='none'">
            </div>
            <div class="book-info">
                <p class="book-title">${b.title}</p>
                <p class="book-author">${b.subtitle}<br>${b.author}</p>
                ${ratingMarkup(b.id)}
                <p class="book-desc">${b.desc}</p>
                <div class="book-meta">${b.tags.map(t => `<span class="book-tag">${t}</span>`).join('')}</div>
                ${IS_NATIVE ? '' : `
                <div class="course-price-row" style="margin-bottom:8px">
                    <span class="course-price">৳${b.price}</span>
                    <span class="course-original">৳${b.originalPrice}</span>
                    <span class="course-discount">${disc}% ছাড়</span>
                </div>`}
                <div class="book-actions">
                    ${has
                        ? `<button class="book-btn owned" onclick="openBookReader('${b.id}')">${ico('book')} বইটি পড়ুন</button>
                           <button class="book-btn-ghost" onclick="openReviewModal('${b.id}')">${ico('star')} রিভিউ ও রেটিং দিন</button>`
                        : IS_NATIVE
                        ? `<button class="book-btn-ghost" onclick="openBookReader('${b.id}')">${ico('eye')} ফ্রি প্রিভিউ দেখুন</button>`
                        : `<button class="book-btn" onclick="openBuyModal('${b.id}')">${ico('cart')} কিনুন → মাত্র ৳${b.price}</button>
                           <button class="book-btn-ghost" onclick="openBookReader('${b.id}')">${ico('eye')} ফ্রি প্রিভিউ দেখুন</button>`
                    }
                </div>
            </div>
        </div>`;
    }).join('');
}

function renderCourses() {
    const el = document.getElementById('courses-container');
    if (!el) return;
    // The course cards are a priced service listing with a buy flow. The APK
    // sells nothing, so it renders none of them — the consultation is still
    // reachable there through the contact card, which books an appointment
    // rather than taking a payment.
    if (IS_NATIVE) { el.innerHTML = ''; return; }
    const purchased = JSON.parse(localStorage.getItem('purchasedCourses') || '[]');
    const userCourses = currentUser ? (userProfile?.courses || []) : [];
    const allPurchased = [...new Set([...purchased, ...userCourses])];

    el.innerHTML = COURSES.map(c => {
        const owned = allPurchased.includes(c.id);
        const disc = Math.round((1 - c.price / c.originalPrice) * 100);
        return `
        <div class="course-card">
            <div class="course-banner">
                <span class="course-badge" style="background:rgba(0,229,153,0.1);color:${c.badgeColor}">${c.badgeIcon ? ico(c.badgeIcon) : ''}${c.badge}</span>
                <span class="course-emoji">${ico(c.emoji, '2rem')}</span>
                <p class="course-title">${c.title}</p>
                <p class="course-desc">${c.desc}</p>
            </div>
            <div class="course-body">
                <p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:8px">রিপোর্টে যা থাকবে</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:14px">
                    ${c.features.map(f => `<div style="display:flex;align-items:center;gap:5px;font-size:0.75rem;color:var(--text-sub)"><span style="color:var(--green);font-size:0.6rem">●</span>${f}</div>`).join('')}
                </div>
                <div class="course-price-row">
                    <span class="course-price">৳${c.price}</span>
                    <span class="course-original">৳${c.originalPrice}</span>
                    <span class="course-discount">${disc}% ছাড়</span>
                </div>
                ${owned
                    ? `<button class="course-buy-btn purchased" disabled>✅ কেনা হয়েছে — ফর্ম পূরণ করুন</button>`
                    : `<button class="course-buy-btn" onclick="openBuyModal('${c.id}')">${ico('steth')} ডায়াগনোসিস শুরু করুন → মাত্র ৳${c.price}</button>`
                }
            </div>
        </div>`;
    }).join('');
}

window.openBuyModal = function(courseId) {
    // Belt-and-braces: the modal markup and every caller are already gone from
    // the native build, but nothing may open a purchase flow inside the APK.
    if (IS_NATIVE) return;
    haptic(10);
    if (!currentUser) {
        showToast('কিনতে হলে আগে Login করুন');
        setTimeout(openLoginModal, 600);
        return;
    }
    const c = ALL_PRODUCTS().find(x => x.id === courseId);
    if (!c) return;
    currentBuyCourse = c;
    currentPayMethod = 'bkash';

    document.getElementById('buy-course-title').textContent = c.title;
    document.getElementById('buy-course-price').textContent = `৳${c.price}`;
    document.getElementById('buy-step1').classList.remove('hidden');
    document.getElementById('buy-step2').classList.add('hidden');
    document.getElementById('buy-txid').value = '';
    document.getElementById('buy-error').textContent = '';
    selectPayMethod('bkash');

    document.getElementById('course-buy-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};
window.closeBuyModal = function() {
    // The whole purchase UI is cut from the native build, so these elements do
    // not exist there. Nothing should be able to call this, but an unguarded
    // deref would be a hard crash if anything ever did.
    if (IS_NATIVE) return;
    document.getElementById('course-buy-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
    currentBuyCourse = null;
};

window.selectPayMethod = function(method) {
    if (IS_NATIVE) return;
    currentPayMethod = method;
    ['bkash','nagad','rocket'].forEach(m => {
        document.getElementById(`pay-${m}`)?.classList.toggle('active', m === method);
    });
    const numbers = { bkash: PAYMENT_BKASH, nagad: PAYMENT_NAGAD, rocket: PAYMENT_ROCKET };
    const labels = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket' };
    document.getElementById('pay-method-name').textContent = labels[method];
    document.getElementById('pay-display-number').textContent = numbers[method];
    document.getElementById('pay-display-amount').textContent = `৳${currentBuyCourse?.price || 0} — Send Money`;
};

// Books unlock the instant the buyer submits their TrxID — no waiting for the
// admin, because the whole product is already sitting on the server and a delay
// only costs the reader their moment. The purchase row is still written and
// still lands in the dashboard (as "auto"), so a made-up TrxID gets rejected
// afterwards and Reject pulls the book back out of that account. Courses keep
// the manual flow: they end in a hand-written report, so verifying first costs
// the buyer nothing.
window.submitCoursePurchase = async function() {
    if (IS_NATIVE) return;
    haptic(15);
    const txid = normalizeTxid(document.getElementById('buy-txid').value);
    if (!txid) { document.getElementById('buy-error').textContent = '⚠️ Transaction ID দিন'; return; }
    if (txid.length < 6) {
        document.getElementById('buy-error').textContent = '⚠️ TrxID খুব ছোট — bKash SMS থেকে হুবহু লিখুন';
        return;
    }
    if (!currentBuyCourse) return;

    const isBook = BOOKS.some(b => b.id === currentBuyCourse.id);
    const btn = document.getElementById('buy-submit-btn');
    if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'অপেক্ষা করুন…'; }

    const now = new Date();
    const purchase = {
        uid: currentUser.uid,
        email: currentUser.email,
        name: userProfile?.name || currentUser.displayName || '',
        phone: userProfile?.phone || '',
        courseId: currentBuyCourse.id,
        courseTitle: currentBuyCourse.title,
        price: currentBuyCourse.price,
        payMethod: currentPayMethod,
        txid,
        status: 'pending',
        submittedAt: `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`,
    };

    let docRef = null;
    if (db) {
        try {
            docRef = await db.collection('purchases').add({
                ...purchase,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
        } catch(e) { console.warn('Purchase save error:', e); }
    }

    // The row is recorded as pending first and promoted to "auto" only after the
    // unlock actually lands, so the dashboard never claims access that a failed
    // Firestore write did not give.
    let unlocked = false;
    if (isBook && !(await txidAlreadySpent(txid))) {
        try {
            await grantProduct(currentUser.uid, purchase.courseId);
            unlocked = true;
            if (docRef) { try { await docRef.update({ status: 'auto' }); } catch(e) { console.warn('Status update failed:', e); } }
        } catch(e) { console.warn('Auto-unlock failed:', e); }
    }

    const kind = isBook ? 'বই' : 'কোর্স';
    const waMsg = `💳 *নতুন ${kind} পেমেন্ট ${unlocked ? 'পেয়েছি (অটো-আনলক হয়েছে)' : 'অনুরোধ'}*\n\n${isBook ? '📖' : '📚'} *${kind}:* ${purchase.courseTitle}\n💰 *পরিমাণ:* ৳${purchase.price}\n📱 *${currentPayMethod.toUpperCase()} TrxID:* ${txid}\n👤 *User:* ${purchase.name || purchase.email}\n📞 *ফোন:* ${purchase.phone || '—'}\n⏰ *সময়:* ${purchase.submittedAt}${unlocked ? '\n\n⚠️ bKash স্টেটমেন্ট মিলিয়ে দেখুন — না মিললে Admin panel থেকে Reject করলে বইটি আবার লক হয়ে যাবে।' : ''}`;
    setTimeout(() => openExternal(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(waMsg)}`), 500);

    if (btn) { btn.disabled = false; if (btn.dataset.label) btn.textContent = btn.dataset.label; }

    const titleEl = document.getElementById('buy-done-title');
    const msgEl   = document.getElementById('buy-done-msg');
    const iconEl  = document.getElementById('buy-done-icon');
    if (unlocked) {
        if (iconEl)  iconEl.textContent  = '📖';
        if (titleEl) titleEl.textContent = 'বইটি আনলক হয়ে গেছে!';
        if (msgEl)   msgEl.innerHTML     = 'এখনই পড়া শুরু করতে পারেন। পেমেন্ট যাচাই করা হবে — TrxID ভুল হলে অ্যাক্সেস বাতিল হতে পারে।';
    } else {
        if (iconEl)  iconEl.textContent  = '🎉';
        if (titleEl) titleEl.textContent = 'অনুরোধ পাঠানো হয়েছে!';
        if (msgEl)   msgEl.innerHTML     = `Raqi Faisal payment verify করার পর আপনার অ্যাকাউন্টে ${kind} unlock হবে।`;
    }

    document.getElementById('buy-step1').classList.add('hidden');
    document.getElementById('buy-step2').classList.remove('hidden');
};

// ══════════════════════════════════════════════════════════
// BLOG — written guidelines, shared with the website
// ══════════════════════════════════════════════════════════
// The posts are built into static pages for Google and Facebook; the app reads
// the same content as JSON so a reader never has to leave for a browser. Loaded
// from the deployment (not the bundle) so a post published today shows up in an
// APK installed last month.
let blogPosts = [];

async function loadBlog() {
    try {
        const res = await fetch(`${API_BASE}/blog/index.json`, { cache: 'no-cache' });
        if (!res.ok) return;
        blogPosts = await res.json();
    } catch (e) {
        console.warn('Blog load failed:', e);
        return;                       // offline: leave the section empty, no error UI
    }
    renderBlogLatest();
    renderBlogList();
}

const blogCard = (p) => `
    <div class="blog-card" onclick="openBlogPost('${p.slug}')">
        ${p.cover ? `<img class="blog-card-img" src="${p.cover}" alt="" loading="lazy">` : ''}
        <div class="blog-card-b">
            <p class="blog-card-date">${p.dateBn} · ${toBn(p.mins)} মিনিট পড়া</p>
            <p class="blog-card-title">${p.title}</p>
            <p class="blog-card-desc">${p.description}</p>
            ${p.tags?.length ? `<div class="blog-card-tags">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        </div>
    </div>`;

function renderBlogLatest() {
    const el = document.getElementById('blog-latest');
    if (!el) return;
    if (!blogPosts.length) { el.closest('.home-blog')?.classList.add('hidden'); return; }
    el.closest('.home-blog')?.classList.remove('hidden');
    // Every imported post carries the same publish date, so "newest two" would
    // be two arbitrary episodes. Lead with standalone pieces and fall back to
    // the opening episode of a series — something that makes sense cold.
    const { series, loose } = seriesGroups();
    const picks = [...loose, ...series.map(s => s.posts[0])].slice(0, 2);
    el.innerHTML = picks.map(blogCard).join('');
}

// Series are shown as one entry that opens its episode list, not as 240 loose
// cards — a programme is read from episode 1, and a flat feed buries it.
let openSeries = null;

function seriesGroups() {
    const map = new Map();
    const loose = [];
    for (const p of blogPosts) {
        if (!p.series) { loose.push(p); continue; }
        if (!map.has(p.series)) map.set(p.series, { slug: p.series, title: p.seriesTitle || p.series, posts: [] });
        map.get(p.series).posts.push(p);
    }
    const series = [...map.values()];
    for (const s of series) {
        s.posts.sort((a, b) => a.episode - b.episode);
        s.cover = (s.posts.find(p => p.cover) || {}).cover || '';
    }
    series.sort((a, b) => b.posts.length - a.posts.length);
    return { series, loose };
}

function renderBlogList() {
    const el = document.getElementById('blog-list');
    if (!el) return;
    if (!blogPosts.length) {
        el.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:40px 12px;font-size:0.85rem">
               এখনো কোনো লেখা প্রকাশ করা হয়নি।</p>`;
        return;
    }

    const { series, loose } = seriesGroups();

    if (openSeries) {
        const s = series.find(x => x.slug === openSeries);
        if (s) {
            el.className = '';
            el.innerHTML = `
                <button onclick="closeSeries()" class="blog-back-link">← সব লেখা</button>
                <p class="blog-series-hd">${s.title}<span>${toBn(s.posts.length)}টি পর্ব</span></p>
                <ol class="ep-list">${s.posts.map(p => `
                    <li onclick="openBlogPost('${p.slug}')">
                        <span class="ep-no">${toBn(p.episode)}</span>
                        <span class="ep-b">
                            <span class="ep-t">${p.title}</span>
                            <span class="ep-d">${p.description}</span>
                        </span>
                    </li>`).join('')}</ol>`;
            return;
        }
        openSeries = null;
    }

    el.className = '';
    el.innerHTML = `
        ${series.length ? `<p class="blog-row-hd">সিরিজ</p>
        <div class="blog-cards">${series.map(s => `
            <div class="blog-card" onclick="openSeriesList('${s.slug}')">
                ${s.cover ? `<img class="blog-card-img" src="${s.cover}" alt="" loading="lazy">` : ''}
                <div class="blog-card-b">
                    <p class="blog-card-date" style="color:var(--green);font-weight:700">সিরিজ · ${toBn(s.posts.length)} পর্ব</p>
                    <p class="blog-card-title">${s.title}</p>
                    <p class="blog-card-desc">${s.posts[0].description}</p>
                </div>
            </div>`).join('')}</div>` : ''}
        ${loose.length ? `<p class="blog-row-hd">সব লেখা</p>
        <div class="blog-cards">${loose.map(blogCard).join('')}</div>` : ''}`;
}

window.openSeriesList = function(slug) {
    haptic(10);
    openSeries = slug;
    renderBlogList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.closeSeries = function() {
    haptic(10);
    openSeries = null;
    renderBlogList();
};

window.openBlogSection = function() { haptic(10); showSection('blog'); };

let currentBlogPost = null;

window.openBlogPost = async function(slug) {
    haptic(10);
    const body = document.getElementById('blog-post-body');
    const modal = document.getElementById('blog-modal');
    if (!body || !modal) return;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<p style="color:var(--text-dim);padding:40px 0;text-align:center">লোড হচ্ছে…</p>';

    try {
        const res = await fetch(`${API_BASE}/blog/${slug}/post.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const p = await res.json();
        currentBlogPost = p;
        body.innerHTML = `
            <p class="blog-post-meta">${p.dateBn} · ${toBn(p.mins)} মিনিট পড়া</p>
            <h1 class="blog-post-title">${p.title}</h1>
            ${p.tags?.length ? `<div class="blog-card-tags" style="margin-bottom:16px">${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
            ${p.cover ? `<img class="blog-post-cover" src="${p.cover}" alt="">` : ''}
            <div class="blog-prose">${p.html}</div>`;
        body.scrollTop = 0;
    } catch (e) {
        body.innerHTML = '<p style="color:var(--text-dim);padding:40px 0;text-align:center">'
            + 'লেখাটি লোড করা গেল না — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।</p>';
    }
};

window.closeBlogPost = function() {
    document.getElementById('blog-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
    currentBlogPost = null;
};

window.shareBlogPost = function() {
    if (!currentBlogPost) return;
    haptic(10);
    const { title, url } = currentBlogPost;
    if (navigator.share) {
        navigator.share({ title, url }).catch(() => {});
    } else {
        openExternal(`https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`);
    }
};

// ══════════════════════════════════════════════════════════
// BOOK REVIEWS & RATING
// ══════════════════════════════════════════════════════════
// Only someone who owns the book may review it, so the score on the store card
// reflects actual readers rather than drive-by ratings.
const STAR_WORDS = ['', 'একদম ভালো লাগেনি', 'মোটামুটি', 'ভালো', 'খুব ভালো', 'অসাধারণ'];

let reviewBookId = null;
let reviewRating = 0;
const reviewStats = {};      // bookId -> { avg, count, items }

function starSvg(filled) {
    return `<svg viewBox="0 0 24 24" class="${filled ? '' : 'off'}" aria-hidden="true">`
         + `<path d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8L12 3Z"/></svg>`;
}

function ratingMarkup(bookId) {
    const s = reviewStats[bookId];
    if (!s || !s.count) return '';
    const full = Math.round(s.avg);
    const stars = [1, 2, 3, 4, 5].map(n => starSvg(n <= full)).join('');
    return `<div class="rating-row">
        <span class="rating-stars">${stars}</span>
        <span class="rating-num">${toBn(s.avg.toFixed(1))}</span>
        <span class="rating-count">(${toBn(s.count)} জন পাঠক)</span>
    </div>`;
}

async function loadReviews(bookId) {
    if (!db) return null;
    try {
        const snap = await db.collection('reviews').where('bookId', '==', bookId).get();
        const items = snap.docs.map(d => d.data()).filter(r => typeof r.rating === 'number');
        const count = items.length;
        const avg = count ? items.reduce((s, r) => s + r.rating, 0) / count : 0;
        // newest first; createdAt is briefly null right after a local write
        items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        reviewStats[bookId] = { avg, count, items };
        return reviewStats[bookId];
    } catch (e) {
        console.warn('Review load error:', e);
        return null;
    }
}

async function refreshBookRatings() {
    let any = false;
    for (const b of BOOKS) {
        if (await loadReviews(b.id)) any = true;
    }
    if (any) renderBooks();
}

window.openReviewModal = function(bookId) {
    haptic(10);
    if (!currentUser) {
        showToast('রিভিউ দিতে আগে Login করুন');
        setTimeout(openLoginModal, 600);
        return;
    }
    if (!ownedIds().has(bookId)) { showToast('বইটি কেনার পর রিভিউ দিতে পারবেন'); return; }
    const b = BOOKS.find(x => x.id === bookId);
    if (!b) return;

    reviewBookId = bookId;
    reviewRating = 0;
    document.getElementById('review-modal-title').textContent = `“${b.title}” — রিভিউ দিন`;
    document.getElementById('rv-text').value = '';
    document.getElementById('rv-improve').value = '';
    document.getElementById('rv-error').textContent = '';
    document.getElementById('review-form').classList.remove('hidden');
    document.getElementById('review-done').classList.add('hidden');
    renderStarPicker();

    document.getElementById('review-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeReviewModal = function() {
    document.getElementById('review-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
    reviewBookId = null;
};

function renderStarPicker() {
    const el = document.getElementById('rv-stars');
    if (!el) return;
    el.innerHTML = [1, 2, 3, 4, 5].map(n =>
        `<button type="button" class="rv-star ${n <= reviewRating ? 'on' : ''}"
                 onclick="setReviewRating(${n})" aria-label="${n} তারা"
                 role="radio" aria-checked="${n === reviewRating}">${starSvg(n <= reviewRating)}</button>`
    ).join('');
    document.getElementById('rv-rating-hint').textContent =
        reviewRating ? STAR_WORDS[reviewRating] : 'তারায় ক্লিক করুন';
}

window.setReviewRating = function(n) {
    haptic(8);
    reviewRating = n;
    renderStarPicker();
};

window.submitReview = async function() {
    const err = document.getElementById('rv-error');
    if (!reviewRating) { err.textContent = '⚠️ আগে রেটিং দিন'; return; }
    if (!reviewBookId || !currentUser || !db) return;

    const btn = document.getElementById('rv-submit');
    btn.disabled = true;
    const doc = {
        bookId: reviewBookId,
        uid: currentUser.uid,
        name: userProfile?.name || currentUser.displayName || 'একজন পাঠক',
        rating: reviewRating,
        review: document.getElementById('rv-text').value.trim().slice(0, 1200),
        improve: document.getElementById('rv-improve').value.trim().slice(0, 1200),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
        // doc id = uid_bookId, so re-submitting edits the earlier review instead
        // of letting one reader stack up several ratings
        await db.collection('reviews').doc(`${currentUser.uid}_${reviewBookId}`).set(doc);
        document.getElementById('review-form').classList.add('hidden');
        document.getElementById('review-done').classList.remove('hidden');
        haptic(20);
        await loadReviews(reviewBookId);
        renderBooks();
    } catch (e) {
        err.textContent = 'সংরক্ষণ করা গেল না: ' + e.message;
    } finally {
        btn.disabled = false;
    }
};

// ══════════════════════════════════════════════════════════
// BOOK READER
// ══════════════════════════════════════════════════════════
// Pages are fetched one at a time from /api/book, which re-checks the purchase
// server-side on every request. The client never holds the whole book, so a
// screenshot is the most a reader can walk away with.
let readerBook = null;
let readerPage = 1;
let readerTotal = 0;
let readerPreview = 12;
let readerReqId = 0;      // guards against a slow page landing after a newer one

async function readerToken() {
    try {
        const u = firebase.auth().currentUser;
        return u ? await u.getIdToken() : '';
    } catch (e) { return ''; }
}

window.openBookReader = async function(bookId, startPage) {
    haptic(10);
    readerBook = BOOKS.find(b => b.id === bookId);
    if (!readerBook) return;

    document.getElementById('reader-title').textContent = readerBook.title;
    document.getElementById('book-reader').classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (!readerTotal) {
        try {
            const r = await fetch(`${API_BASE}/api/book?meta=1`);
            const m = await r.json();
            readerTotal = m.pages || 0;
            readerPreview = m.preview ?? 12;
        } catch (e) { readerTotal = 0; }
    }
    readerPage = startPage || Number(localStorage.getItem(`bookmark:${bookId}`)) || 1;
    if (readerPage > readerTotal) readerPage = 1;
    await showReaderPage();
};

window.closeBookReader = function() {
    document.getElementById('book-reader').classList.add('hidden');
    document.body.style.overflow = 'auto';
    if (readerBook) localStorage.setItem(`bookmark:${readerBook.id}`, String(readerPage));
};

async function showReaderPage() {
    const stage = document.getElementById('reader-stage');
    const myReq = ++readerReqId;
    stage.innerHTML = '<p style="color:var(--text-dim);padding:40px;font-size:0.85rem">লোড হচ্ছে…</p>';
    updateReaderChrome();

    const token = await readerToken();
    try {
        // token travels as a header, not a query param, so it stays out of
        // access logs and browser history
        const res = await fetch(`${API_BASE}/api/book?page=${readerPage}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (myReq !== readerReqId) return;             // a newer page won the race
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showReaderGate(err.error);
            return;
        }
        const blob = await res.blob();
        if (myReq !== readerReqId) return;
        const img = new Image();
        img.alt = `পাতা ${readerPage}`;
        img.src = URL.createObjectURL(blob);
        img.onload = () => URL.revokeObjectURL(img.src);
        stage.innerHTML = '';
        stage.appendChild(img);
        stage.scrollTop = 0;
        if (readerBook) localStorage.setItem(`bookmark:${readerBook.id}`, String(readerPage));

        // Finished the book — ask for the review here, where they've actually read it
        if (readerPage === readerTotal && readerBook && ownedIds().has(readerBook.id)) {
            const end = document.createElement('div');
            end.className = 'reader-msg';
            end.style.paddingTop = '26px';
            end.innerHTML = `<h3>বইটি শেষ হলো 🌿</h3>
                <p>আপনার মতামত অন্য পাঠকদের সাহায্য করবে, আর পরামর্শগুলো পরের সংস্করণে কাজে লাগবে।</p>
                <button class="book-btn" onclick="closeBookReader();openReviewModal('${readerBook.id}')">
                    রিভিউ ও রেটিং দিন
                </button>`;
            stage.appendChild(end);
        }
    } catch (e) {
        if (myReq === readerReqId) {
            stage.innerHTML = '<div class="reader-msg"><h3>লোড করা গেল না</h3>'
                + '<p>ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।</p></div>';
        }
    }
}

function showReaderGate(reason) {
    const stage = document.getElementById('reader-stage');
    const b = readerBook;

    // Play's anti-steering rule bans not just in-app purchase but any nudge
    // toward buying elsewhere — a price, a "কিনুন" button, even "buy it on the
    // website" would breach it. So the APK states the fact and stops there:
    // a book bought on the web unlocks here as soon as that account signs in.
    if (IS_NATIVE) {
        stage.innerHTML = `<div class="reader-msg">
            <h3>🔒 ফ্রি প্রিভিউ শেষ</h3>
            <p>প্রথম ${toBn(readerPreview)} পাতা সবার জন্য উন্মুক্ত। পুরো বইটি আপনার
               অ্যাকাউন্টে যুক্ত হলে এখানেই খুলে যাবে।</p>
            ${currentUser ? '' : `<button class="book-btn" onclick="closeBookReader();openLoginModal()">Login করুন</button>`}
        </div>`;
        return;
    }

    if (reason === 'login_required') {
        stage.innerHTML = `<div class="reader-msg">
            <h3>🔒 ফ্রি প্রিভিউ শেষ</h3>
            <p>প্রথম ${toBn(readerPreview)} পাতা সবার জন্য ফ্রি। পুরো বইটি পড়তে Login করুন, তারপর কিনুন।</p>
            <button class="book-btn" onclick="closeBookReader();openLoginModal()">Login করুন</button>
        </div>`;
    } else {
        stage.innerHTML = `<div class="reader-msg">
            <h3>🔒 ফ্রি প্রিভিউ শেষ</h3>
            <p>প্রথম ${toBn(readerPreview)} পাতা ফ্রি। বাকি ${toBn(readerTotal - readerPreview)} পাতা পড়তে বইটি কিনুন — মাত্র ৳${toBn(b.price)}।</p>
            <button class="book-btn" onclick="closeBookReader();openBuyModal('${b.id}')">${ico('cart')} কিনুন → ৳${toBn(b.price)}</button>
        </div>`;
    }
}

function updateReaderChrome() {
    document.getElementById('reader-pageno').textContent =
        readerTotal ? `${toBn(readerPage)} / ${toBn(readerTotal)}` : '';
    document.getElementById('reader-prev').disabled = readerPage <= 1;
    document.getElementById('reader-next').disabled = readerPage >= readerTotal;
    const chip = document.getElementById('reader-preview-chip');
    const owned = readerBook ? ownedIds().has(readerBook.id) : false;
    chip.classList.toggle('hidden', owned);
}

window.readerGo = function(delta) {
    const next = readerPage + delta;
    if (next < 1 || next > readerTotal) return;
    haptic(8);
    readerPage = next;
    showReaderPage();
};

window.promptReaderJump = function() {
    const raw = prompt(`কত নম্বর পাতায় যাবেন? (১–${readerTotal})`, String(readerPage));
    if (raw === null) return;
    const n = parseInt(raw.replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)), 10);
    if (!Number.isInteger(n) || n < 1 || n > readerTotal) { showToast('ভুল পাতা নম্বর'); return; }
    readerPage = n;
    showReaderPage();
};

document.addEventListener('keydown', (e) => {
    if (document.getElementById('book-reader')?.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft')  readerGo(-1);
    if (e.key === 'ArrowRight') readerGo(1);
    if (e.key === 'Escape')     closeBookReader();
});

// ══════════════════════════════════════════════════════════
// PATIENT SYSTEM
// ══════════════════════════════════════════════════════════
const ADMIN_EMAIL    = 'crackdmcbuet@gmail.com';
const ADMIN_WA       = '8801886608999';

let allPatients      = [];   // loaded from Firestore
let patientFilter    = 'all';
let selectedDuration = '';
let pendingPatientFormOpen = false;

// ── Open / Close patient form ────────────────────────────
window.openPatientForm = function() {
    haptic(10);
    const modal = document.getElementById('patient-form-modal');
    if (!modal) return;
    document.getElementById('pf-login-required')?.classList.add('hidden');
    document.getElementById('pf-success')?.classList.add('hidden');
    document.getElementById('pf-form')?.classList.remove('hidden');

    if (!currentUser) {
        // Not logged in — show login required
        document.getElementById('pf-form')?.classList.add('hidden');
        document.getElementById('pf-login-required')?.classList.remove('hidden');
        pendingPatientFormOpen = true;
    } else if (currentUser.email === ADMIN_EMAIL) {
        modal.classList.add('hidden');
        openAdminDashboard();
        return;
    } else {
        // Pre-fill name/email from Google profile
        const nameEl = document.getElementById('pf-name');
        if (nameEl && !nameEl.value && currentUser.displayName) nameEl.value = currentUser.displayName;
    }
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closePatientForm = function() {
    document.getElementById('patient-form-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
    pendingPatientFormOpen = false;
};

// ── Chip / Duration helpers ──────────────────────────────
window.toggleChip = function(label) {
    label.classList.toggle('checked');
    const cb = label.querySelector('input[type=checkbox]');
    if (cb) cb.checked = !cb.checked;
    const checkEl = label.querySelector('.chip-check');
    if (checkEl) checkEl.textContent = cb?.checked ? '✓' : '';
};

window.selectDuration = function(el, val) {
    document.querySelectorAll('.duration-opt').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');
    selectedDuration = val;
};

// ── Submit patient form ──────────────────────────────────
window.submitPatientForm = async function() {
    haptic(10);
    const name     = document.getElementById('pf-name')?.value?.trim();
    const age      = document.getElementById('pf-age')?.value?.trim();
    const gender   = document.getElementById('pf-gender')?.value;
    const phone    = document.getElementById('pf-phone')?.value?.trim();
    const location = document.getElementById('pf-location')?.value?.trim() || 'অজানা';
    const marital  = document.getElementById('pf-marital')?.value || 'অবিবাহিত';
    const prevTx   = document.getElementById('pf-prev-treatment')?.value || 'না';
    const details  = document.getElementById('pf-details')?.value?.trim();
    const dreams   = document.getElementById('pf-dream')?.value?.trim() || '';

    const problems = [...document.querySelectorAll('#problem-grid input:checked')].map(cb => cb.value);

    // Validate
    if (!name)    { showToast('⚠️ নাম দিন'); return; }
    if (!age)     { showToast('⚠️ বয়স দিন'); return; }
    if (!gender)  { showToast('⚠️ লিঙ্গ বেছে নিন'); return; }
    if (!phone)   { showToast('⚠️ WhatsApp নম্বর দিন'); return; }
    if (!problems.length) { showToast('⚠️ সমস্যার ধরন বেছে নিন'); return; }
    if (!selectedDuration) { showToast('⚠️ সমস্যার সময়কাল বেছে নিন'); return; }
    if (!details) { showToast('⚠️ বিস্তারিত বিবরণ দিন'); return; }

    const now = new Date();
    const dateStr = `${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()} ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

    const patientData = {
        uid: currentUser?.uid || 'guest',
        email: currentUser?.email || '',
        name, age, gender, phone, location, marital,
        problems, duration: selectedDuration,
        prevTreatment: prevTx, details, dreams,
        status: 'pending',
        submittedAt: dateStr,
        adminNotes: '',
    };

    // Save to Firestore
    if (db && currentUser) {
        try {
            await db.collection('patients').doc(currentUser.uid).set({
                ...patientData,
                submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
                submittedAtStr: dateStr,
            });
        } catch (e) {
            console.warn('Firestore save failed:', e);
        }
    }

    // Save to localStorage as backup
    localStorage.setItem('myPatientForm', JSON.stringify(patientData));

    // Show success
    document.getElementById('pf-form')?.classList.add('hidden');
    document.getElementById('pf-success')?.classList.remove('hidden');

    // Open WhatsApp
    const waText = buildWAMessage(patientData);
    setTimeout(() => {
        openExternal(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(waText)}`);
    }, 800);

    showToast('✅ পাঠানো হয়েছে! WhatsApp খুলছে...');
};

function buildWAMessage(d) {
    return `🌿 *নতুন রুকিয়াহ পরামর্শ অনুরোধ*

👤 *নাম:* ${d.name}
🎂 *বয়স:* ${d.age} | *লিঙ্গ:* ${d.gender}
📱 *WhatsApp:* ${d.phone}
🏙️ *এলাকা:* ${d.location}
💍 *বৈবাহিক:* ${d.marital}

🔴 *সমস্যার ধরন:*
${d.problems.map(p => `• ${p}`).join('\n')}

⏱️ *সময়কাল:* ${d.duration}
💊 *আগের চিকিৎসা:* ${d.prevTreatment}

📝 *বিস্তারিত:*
${d.details}${d.dreams ? `\n\n🌙 *স্বপ্ন:*\n${d.dreams}` : ''}

⏰ *সময়:* ${d.submittedAt}
📧 *Email:* ${d.email}`;
}

// ── Admin Dashboard ──────────────────────────────────────
window.openAdminDashboard = async function() {
    haptic(10);
    const modal = document.getElementById('admin-modal');
    if (!modal) return;
    if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
        showToast('Admin access নেই'); return;
    }
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await loadPatients();
};
window.closeAdminDashboard = function() {
    document.getElementById('admin-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
};

async function loadPatients() {
    const listEl = document.getElementById('admin-patient-list');
    if (!listEl) return;
    if (!db) {
        listEl.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-dim)">
            <p style="margin-bottom:8px">Firebase config সেট করুন</p>
            <p style="font-size:0.78rem">firebase-config.js-এ API key দিলে সব patient data দেখা যাবে</p>
        </div>`;
        return;
    }
    try {
        listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px">Loading...</p>';
        const snap = await db.collection('patients').orderBy('submittedAt', 'desc').get();
        allPatients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderPatientList(allPatients, patientFilter);
    } catch (e) {
        listEl.innerHTML = `<p style="color:#ff6b6b;font-size:0.82rem;text-align:center;padding:16px">Error: ${e.message}</p>`;
    }
}

function renderPatientList(patients, filter = 'all') {
    const listEl = document.getElementById('admin-patient-list');
    if (!listEl) return;
    const filtered = filter === 'all' ? patients : patients.filter(p => p.status === filter);
    if (!filtered.length) {
        listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:24px">কোনো patient নেই</p>';
        return;
    }
    listEl.innerHTML = filtered.map(p => {
        const statusLabels = { pending:'⏳ Pending', reviewed:'👁 Reviewed', 'in-treatment':'💚 চিকিৎসা', done:'✓ সম্পন্ন' };
        const sbClass = { pending:'sb-pending', reviewed:'sb-reviewed', 'in-treatment':'sb-in-treatment', done:'sb-done' };
        const dateStr = p.submittedAtStr || (p.submittedAt?.toDate ? p.submittedAt.toDate().toLocaleDateString('bn-BD') : '—');
        return `
        <div class="patient-card" data-status="${p.status}" id="pc-${p.id}">
            <div class="patient-card-header">
                <div>
                    <p class="patient-name">${p.name || '—'}</p>
                    <p class="patient-meta-row">${p.age} বছর · ${p.gender} · ${p.location || '—'} · 📱 ${p.phone || '—'}</p>
                </div>
                <span class="status-badge ${sbClass[p.status] || 'sb-pending'}">${statusLabels[p.status] || 'Pending'}</span>
            </div>
            <div class="patient-problems">
                ${(p.problems || []).map(pr => `<span class="patient-problem-tag">${pr}</span>`).join('')}
            </div>
            <p style="font-size:0.72rem;color:var(--text-dim);margin-bottom:6px">⏱ ${p.duration || '—'} · 💊 ${p.prevTreatment || '—'} · 📅 ${dateStr}</p>
            <details style="margin-top:6px">
                <summary style="font-size:0.78rem;color:var(--text-sub);cursor:pointer;font-weight:600">বিস্তারিত দেখুন ▼</summary>
                <div class="patient-detail" style="margin-top:8px">
                    <p style="margin-bottom:6px"><strong>সমস্যার বিবরণ:</strong><br>${p.details || '—'}</p>
                    ${p.dreams ? `<p style="margin-top:8px"><strong>স্বপ্ন:</strong><br>${p.dreams}</p>` : ''}
                </div>
                <textarea class="admin-notes-input" id="notes-${p.id}" placeholder="Admin নোট লিখুন...">${p.adminNotes || ''}</textarea>
            </details>
            <div class="patient-actions">
                <button onclick="setPatientStatus('${p.id}','reviewed')" class="patient-action-btn">👁 Reviewed</button>
                <button onclick="setPatientStatus('${p.id}','in-treatment')" class="patient-action-btn">💚 চিকিৎসা শুরু</button>
                <button onclick="setPatientStatus('${p.id}','done')" class="patient-action-btn">✓ সম্পন্ন</button>
                <button onclick="saveAdminNote('${p.id}')" class="patient-action-btn">💾 নোট সেভ</button>
                ${p.phone ? `<button onclick="openExternal('https://wa.me/88${p.phone.replace(/^0/,'')}')" class="patient-action-btn wa">💬 WhatsApp</button>` : ''}
            </div>
        </div>`;
    }).join('');
}

window.filterPatients = function(filter, btn) {
    patientFilter = filter;
    document.querySelectorAll('.admin-filter-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    renderPatientList(allPatients, filter);
};

window.setPatientStatus = async function(uid, status) {
    haptic(10);
    if (!db) { showToast('Firebase config নেই'); return; }
    try {
        await db.collection('patients').doc(uid).update({ status });
        const p = allPatients.find(x => x.id === uid);
        if (p) p.status = status;
        renderPatientList(allPatients, patientFilter);
        showToast('Status আপডেট হয়েছে ✅');
    } catch(e) { showToast('Error: ' + e.message); }
};

window.saveAdminNote = async function(uid) {
    haptic(8);
    const note = document.getElementById(`notes-${uid}`)?.value || '';
    if (!db) { showToast('Firebase config নেই'); return; }
    try {
        await db.collection('patients').doc(uid).update({ adminNotes: note });
        showToast('নোট সেভ হয়েছে ✅');
    } catch(e) { showToast('Error: ' + e.message); }
};

// Admin: load purchases
let adminView = 'patients'; // 'patients' | 'purchases'
let allPurchases = [];      // last loaded list, used for the duplicate-TrxID check

window.switchAdminView = async function(view, btn) {
    adminView = view;
    document.querySelectorAll('.admin-view-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    if (view === 'purchases') await loadPurchases();
    else if (view === 'reviews') await loadReviewsAdmin();
    else await loadPatients();
};

// Reader feedback, newest first. The "কীভাবে আরও ভালো করা যায়" answers are only
// worth collecting if they land somewhere the author actually reads them.
async function loadReviewsAdmin() {
    const listEl = document.getElementById('admin-patient-list');
    if (!listEl || !db) return;
    listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px">Loading...</p>';
    try {
        const snap = await db.collection('reviews').get();
        const rows = snap.docs.map(d => d.data())
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        if (!rows.length) {
            listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:24px">এখনো কোনো রিভিউ নেই</p>';
            return;
        }
        const avg = rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length;
        const withIdeas = rows.filter(r => r.improve).length;

        listEl.innerHTML = `
            <div class="patient-card" style="border-left-color:#facc15">
                <p class="patient-name">⭐ গড় রেটিং ${toBn(avg.toFixed(2))} / ৫</p>
                <p class="patient-meta-row">${toBn(rows.length)} টি রিভিউ · ${toBn(withIdeas)} টিতে উন্নতির পরামর্শ আছে</p>
            </div>` + rows.map(r => {
            const stars = '★'.repeat(r.rating || 0) + '☆'.repeat(5 - (r.rating || 0));
            const when = r.createdAt?.seconds
                ? new Date(r.createdAt.seconds * 1000).toLocaleDateString('bn-BD')
                : '—';
            return `<div class="patient-card" style="border-left-color:${(r.rating || 0) >= 4 ? 'var(--green)' : '#facc15'}">
                <div class="patient-card-header">
                    <div>
                        <p class="patient-name">${esc(r.name || 'একজন পাঠক')}</p>
                        <p class="patient-meta-row" style="color:#facc15;letter-spacing:2px">${stars}</p>
                    </div>
                    <span class="status-badge" style="background:rgba(255,255,255,0.06)">${when}</span>
                </div>
                ${r.review ? `<p style="font-size:0.83rem;color:var(--text-sub);margin-top:6px">${esc(r.review)}</p>` : ''}
                ${r.improve ? `<p style="font-size:0.82rem;color:#facc15;margin-top:8px;padding:9px 11px;
                    background:rgba(250,204,21,0.06);border-radius:10px">
                    💡 <strong>উন্নতির পরামর্শ:</strong> ${esc(r.improve)}</p>` : ''}
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = `<p style="color:#ff6b6b;text-align:center;padding:16px;font-size:0.82rem">${esc(e.message)}</p>`;
    }
}

// Reader-supplied text goes into innerHTML, so it must not be able to carry markup.
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function loadPurchases() {
    const listEl = document.getElementById('admin-patient-list');
    if (!listEl || !db) return;
    try {
        listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px">Loading...</p>';
        const snap = await db.collection('purchases').orderBy('createdAt', 'desc').get();
        const purchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (!purchases.length) { listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:24px">কোনো purchase নেই</p>'; return; }
        allPurchases = purchases;

        // One bKash payment = one TrxID. The same TrxID on two rows means either
        // a double submit or someone reusing a friend's payment — either way the
        // admin must see it before clicking Confirm, not after.
        const byTxid = new Map();
        for (const p of purchases) {
            const key = normalizeTxid(p.txid);
            if (!key) continue;
            if (!byTxid.has(key)) byTxid.set(key, []);
            byTxid.get(key).push(p);
        }

        listEl.innerHTML = purchases.map(p => {
            // "auto" = the book unlocked itself on submit and the payment is
            // still unverified — it needs the admin's eyes more than a pending
            // row does, so it gets its own colour instead of reading as done.
            const sbColor = p.status === 'confirmed' ? 'var(--green)'
                          : p.status === 'rejected'  ? '#ff6b6b'
                          : p.status === 'auto'      ? '#38bdf8'
                          : '#facc15';
            const sbLabel = p.status === 'auto' ? 'auto-unlocked · যাচাই বাকি' : p.status;
            const siblings = (byTxid.get(normalizeTxid(p.txid)) || []).filter(x => x.id !== p.id);
            const dupConfirmed = siblings.some(x => x.status === 'confirmed' || x.status === 'auto');
            const dupWarn = siblings.length ? `
                <p style="font-size:0.72rem;color:#ff6b6b;font-weight:700;margin-top:4px">
                    ⚠️ একই TrxID আরও ${toBn(siblings.length)}টি অনুরোধে আছে${dupConfirmed ? ' — যার একটি ইতিমধ্যে confirmed' : ''}
                    <br><span style="font-weight:400;color:var(--text-sub)">${siblings.map(x => `${x.name || x.email} · ${x.status}`).join(' | ')}</span>
                </p>` : '';
            return `<div class="patient-card" style="border-left-color:${siblings.length ? '#ff6b6b' : sbColor}" data-status="${p.status}">
                <div class="patient-card-header">
                    <div>
                        <p class="patient-name">📚 ${p.courseTitle || p.courseId}</p>
                        <p class="patient-meta-row">৳${p.price} · ${p.payMethod?.toUpperCase()} · TrxID: <strong>${p.txid}</strong></p>
                        <p class="patient-meta-row">👤 ${p.name || p.email} · 📞 ${p.phone || '—'}</p>
                        ${dupWarn}
                    </div>
                    <span class="status-badge" style="background:rgba(255,255,255,0.06);color:${sbColor}">${sbLabel}</span>
                </div>
                <p style="font-size:0.72rem;color:var(--text-dim)">⏰ ${p.submittedAt || '—'}</p>
                <div class="patient-actions" style="margin-top:8px">
                    <button onclick="confirmPurchase('${p.id}','${p.uid}','${p.courseId}')" class="patient-action-btn" style="color:var(--green)">✅ Confirm</button>
                    <button onclick="rejectPurchase('${p.id}')" class="patient-action-btn" style="color:#ff6b6b">❌ Reject</button>
                    ${p.phone ? `<button onclick="openExternal('https://wa.me/88${p.phone.replace(/^0/,'')}')" class="patient-action-btn wa">💬 WA</button>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        listEl.innerHTML = `<p style="color:#ff6b6b;text-align:center;padding:16px;font-size:0.82rem">${e.message}</p>`;
    }
}

window.confirmPurchase = async function(purchaseId, userId, courseId) {
    haptic(10);
    if (!db) return;

    // Last line of defence before money-less unlocks: never confirm a TrxID that
    // already paid for something, unless the admin overrides on purpose.
    const me = allPurchases.find(x => x.id === purchaseId);
    if (me) {
        const clash = allPurchases.find(x =>
            x.id !== purchaseId &&
            (x.status === 'confirmed' || x.status === 'auto') &&
            normalizeTxid(x.txid) === normalizeTxid(me.txid) &&
            normalizeTxid(me.txid) !== ''
        );
        if (clash) {
            const ok = confirm(
                `⚠️ এই TrxID (${me.txid}) দিয়ে আগেই একটি পেমেন্ট confirm করা হয়েছে:\n\n`
                + `${clash.name || clash.email} — ${clash.courseTitle || clash.courseId} — ৳${clash.price}\n`
                + `সময়: ${clash.submittedAt || '—'}\n\n`
                + `একই লেনদেন দুবার গোনা হচ্ছে না তো? bKash স্টেটমেন্ট মিলিয়ে দেখুন।\n\n`
                + `তারপরও Confirm করতে চান?`
            );
            if (!ok) return;
        }
    }

    try {
        await db.collection('purchases').doc(purchaseId).update({ status: 'confirmed' });
        // Unlock for the buyer. set+merge rather than update(): early Google
        // sign-ins never wrote a users/<uid> doc, and update() throws on a
        // missing document — which used to fail the unlock silently.
        await db.collection('users').doc(userId).set({
            courses: firebase.firestore.FieldValue.arrayUnion(courseId),
        }, { merge: true });
        showToast('✅ Payment confirmed & unlocked for the buyer!');
        await loadPurchases();
    } catch(e) { showToast('Error: ' + e.message); }
};

window.rejectPurchase = async function(purchaseId) {
    haptic(10);
    if (!db) return;
    const p = allPurchases.find(x => x.id === purchaseId);
    // A book unlocks itself on submit, so rejecting one has to take the access
    // back — otherwise an invented TrxID keeps the book for good.
    const revoke = !!(p && p.status === 'auto' && p.uid && p.courseId);
    if (revoke && !confirm(`❌ Reject করলে "${p.courseTitle || p.courseId}" ${p.name || p.email}-এর অ্যাকাউন্ট থেকে লক হয়ে যাবে।\n\nTrxID: ${p.txid}\n\nএগিয়ে যাবেন?`)) return;
    try {
        await db.collection('purchases').doc(purchaseId).update({ status: 'rejected' });
        if (revoke) {
            await db.collection('users').doc(p.uid).set({
                courses: firebase.firestore.FieldValue.arrayRemove(p.courseId),
            }, { merge: true });
        }
        showToast(revoke ? '❌ Rejected — অ্যাক্সেস বাতিল করা হয়েছে' : 'Purchase rejected');
        await loadPurchases();
    } catch(e) { showToast('Error: ' + e.message); }
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('profile-dropdown');
    const avatarBtn = document.getElementById('user-avatar-btn');
    if (dropdown && avatarBtn && !avatarBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
    // Close sleep picker on outside click
    const picker = document.getElementById('sleep-picker');
    const sleepBtn = document.getElementById('sleep-timer-btn');
    if (picker && sleepBtn && !picker.contains(e.target) && !sleepBtn.contains(e.target)) {
        picker.classList.add('hidden');
    }
});

// ══════════════════════════════════════════════════════════
// HAPTIC FEEDBACK
// ══════════════════════════════════════════════════════════
function haptic(ms = 10) {
    try {
        if (window.Capacitor && window.Capacitor.isPluginAvailable('Haptics')) {
            const Haptics = window.Capacitor.Plugins.Haptics;
            if (ms >= 15) {
                Haptics.impact({ style: 'MEDIUM' });
            } else {
                Haptics.impact({ style: 'LIGHT' });
            }
        } else {
            navigator.vibrate?.(ms);
        }
    } catch(e) {
        try { navigator.vibrate?.(ms); } catch(err) {}
    }
}

// ══════════════════════════════════════════════════════════
// NATIVE SHELL — back button, status bar, splash, external links
//
// Plugins are read off window.Capacitor.Plugins rather than imported: this app
// ships as plain classic scripts with no bundler, and the native bridge
// registers them there at runtime. On the web every helper below degrades to
// its browser equivalent.
// ══════════════════════════════════════════════════════════
function nativePlugin(name) {
    try {
        if (window.Capacitor?.isPluginAvailable?.(name)) return window.Capacitor.Plugins[name];
    } catch (e) { /* not running under Capacitor */ }
    return null;
}

// A target="_blank" inside a WebView opens a bare window with no address bar
// and no back affordance — a dead end. Chrome Custom Tabs give the user a way
// back to the app.
window.openExternal = function(url) {
    const Browser = nativePlugin('Browser');
    if (Browser) { Browser.open({ url, presentationStyle: 'popover' }); return; }
    window.open(url, '_blank', 'noopener');
};

// Every full-screen surface, mapped to the function that closes it properly
// (clearing timers, restoring body scroll, tearing down players). The back
// button must run these rather than just hiding the element.
const OVERLAY_CLOSERS = {
    'yt-modal': 'closePlayer',
    'pdf-modal': 'closePDF',
    'blog-modal': 'closeBlogPost',
    'search-overlay': 'closeSearchOverlay',
    'login-modal': 'closeLoginModal',
    'review-modal': 'closeReviewModal',
    'course-buy-modal': 'closeBuyModal',
    'patient-form-modal': 'closePatientForm',
    'admin-modal': 'closeAdminDashboard',
    'rating-modal': 'closeRatingModal',
    'tasbeeh-modal': 'closeTasbeeh',
    'reminder-modal': 'closeReminderModal',
    'goal-modal': 'closeGoalModal',
    'stats-modal': 'closeStatsModal',
    'playlist-modal': 'closePlaylistModal',
    'add-playlist-modal': 'closeAddPlaylistModal',
    'symptom-modal': 'closeSymptomChecker',
    'program-modal': 'closeProgramModal',
    'journal-modal': 'closeJournalModal',
    'downloads-modal': 'closeDownloadsModal',
    'chat-settings-modal': 'closeChatSettings',
    'book-reader': 'closeBookReader',
};

// Topmost = last one opened. DOM order is a good enough proxy here because
// these are all siblings and only one or two are ever open at once.
function topmostOpenOverlay() {
    const open = Object.keys(OVERLAY_CLOSERS)
        .map(id => document.getElementById(id))
        .filter(el => el && !el.classList.contains('hidden'));
    return open.length ? open[open.length - 1] : null;
}

function closeTopmostOverlay() {
    const el = topmostOpenOverlay();
    if (!el) return false;
    const fn = window[OVERLAY_CLOSERS[el.id]];
    if (typeof fn === 'function') fn();
    else { el.classList.add('hidden'); document.body.style.overflow = 'auto'; }
    return true;
}

let lastBackPress = 0;

function initNativeShell() {
    if (!IS_NATIVE) return;

    const StatusBar = nativePlugin('StatusBar');
    if (StatusBar) {
        // Light glyphs on our near-black chrome. 'DARK' here means dark
        // background, which is Capacitor's naming, not dark icons.
        StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
        StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    }

    const SplashScreen = nativePlugin('SplashScreen');
    if (SplashScreen) SplashScreen.hide().catch(() => {});

    // Offering a Google button that cannot work is worse than not offering it.
    // It comes back the moment google-services.json and the SHA fingerprints
    // are in place and @capacitor-firebase/authentication is installed.
    if (!nativePlugin('FirebaseAuthentication')) {
        document.getElementById('google-signin-btn')?.classList.add('hidden');
        document.querySelector('#login-modal .or-divider')?.classList.add('hidden');
    }

    const App = nativePlugin('App');
    if (!App) return;

    // Android's hardware/gesture back. Without a handler Capacitor exits the
    // app on the first press, from anywhere — including out of an open modal.
    App.addListener('backButton', () => {
        if (closeTopmostOverlay()) return;

        const onHome = !document.getElementById('section-home')?.classList.contains('hidden');
        if (!onHome) { showSection('home'); return; }

        const now = Date.now();
        if (now - lastBackPress < 2000) { App.exitApp(); return; }
        lastBackPress = now;
        showToast('আবার চাপলে অ্যাপ বন্ধ হবে');
    });

    // YouTube's terms do not allow playback to continue while the player is
    // hidden or the app is in the background, so pause on the way out. The
    // native-audio path (item.audio) is exempt and is handled separately.
    App.addListener('appStateChange', ({ isActive }) => {
        if (isActive || usingNativeAudio) return;
        try { ytPlayer?.pauseVideo?.(); } catch (e) {}
    });
}

// ══════════════════════════════════════════════════════════
// PLAYER: AUTO-PLAY NEXT, LOOP, MEDIA SESSION
// ══════════════════════════════════════════════════════════
let autoPlayEnabled = localStorage.getItem('autoPlay') === '1';
let loopMode = localStorage.getItem('loopMode') || 'off'; // 'off' | 'one' | 'all'

function updatePlayerModeButtons() {
    const apBtn = document.getElementById('autoplay-btn');
    const loopBtn = document.getElementById('loop-btn');
    if (apBtn)   apBtn.classList.toggle('active-feature', autoPlayEnabled);
    if (loopBtn) {
        loopBtn.classList.toggle('active-feature', loopMode !== 'off');
        loopBtn.title = loopMode === 'one' ? 'লুপ: এটি (1)' : loopMode === 'all' ? 'লুপ: সব' : 'লুপ: বন্ধ';
    }
}

window.toggleAutoPlay = function() {
    haptic(8);
    autoPlayEnabled = !autoPlayEnabled;
    localStorage.setItem('autoPlay', autoPlayEnabled ? '1' : '0');
    updatePlayerModeButtons();
    showToast(autoPlayEnabled ? '▶▶ Auto-play চালু' : 'Auto-play বন্ধ');
};

window.cycleLoop = function() {
    haptic(8);
    loopMode = loopMode === 'off' ? 'one' : loopMode === 'one' ? 'all' : 'off';
    localStorage.setItem('loopMode', loopMode);
    updatePlayerModeButtons();
    const labels = { off: 'লুপ বন্ধ', one: '🔂 একটি লুপ', all: '🔁 সব লুপ' };
    showToast(labels[loopMode]);
};

function playNextAudio() {
    if (!currentPlayerItem) return;
    // Check playlist queue first
    if (currentPlaylistQueue?.length > 1) {
        currentPlaylistPos = (currentPlaylistPos + 1) % currentPlaylistQueue.length;
        openPlayer(currentPlaylistQueue[currentPlaylistPos]);
        return;
    }
    const sameCategory = audioData.filter(a => a.category === currentPlayerItem.category);
    const idx = sameCategory.findIndex(a => a.code === currentPlayerItem.code);
    const next = sameCategory[(idx + 1) % sameCategory.length];
    if (next && next.code !== currentPlayerItem.code) openPlayer(next.code);
}

function playPrevAudio() {
    if (!currentPlayerItem) return;
    if (currentPlaylistQueue?.length > 1) {
        currentPlaylistPos = (currentPlaylistPos - 1 + currentPlaylistQueue.length) % currentPlaylistQueue.length;
        openPlayer(currentPlaylistQueue[currentPlaylistPos]);
        return;
    }
    const sameCategory = audioData.filter(a => a.category === currentPlayerItem.category);
    const idx = sameCategory.findIndex(a => a.code === currentPlayerItem.code);
    const prev = sameCategory[(idx - 1 + sameCategory.length) % sameCategory.length];
    if (prev && prev.code !== currentPlayerItem.code) openPlayer(prev.code);
}

function handleYTEnded() {
    handlePlaybackEnded();
}

// Central end-of-track handler: repeat counter takes priority, then loop/autoplay
function handlePlaybackEnded() {
    if (repeatTarget > 0) {
        repeatDone++;
        renderRepeatProgress();
        if (repeatDone < repeatTarget) {
            replayCurrentTrack();
            return;
        }
        showToast(`✅ ${toBn(repeatTarget)} বার শোনা সম্পন্ন! আলহামদুলিল্লাহ`);
        haptic(30);
        repeatDone = 0;
        renderRepeatProgress();
        return;
    }
    if (loopMode === 'one') {
        replayCurrentTrack();
    } else if (loopMode === 'all' || autoPlayEnabled) {
        playNextAudio();
    }
}

function replayCurrentTrack() {
    if (usingNativeAudio && nativeAudioEl()) {
        const a = nativeAudioEl();
        a.currentTime = 0;
        a.play().catch(() => {});
    } else {
        ytPlayer?.seekTo?.(0); ytPlayer?.playVideo?.();
    }
}

function updateMediaSession(item) {
    if (!navigator.mediaSession || !item) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title_bn,
        artist: item.category,
        album: 'Al Quranic Ruqyah Healing',
    });
    navigator.mediaSession.setActionHandler('stop',          () => { closePlayer(); });
    navigator.mediaSession.setActionHandler('nexttrack',     () => { haptic(); playNextAudio(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { haptic(); playPrevAudio(); });
    navigator.mediaSession.setActionHandler('play',  () => playerPlay());
    navigator.mediaSession.setActionHandler('pause', () => playerPause());
    try {
        navigator.mediaSession.setActionHandler('seekbackward', () => { if (usingNativeAudio) npSkip(-10); });
        navigator.mediaSession.setActionHandler('seekforward',  () => { if (usingNativeAudio) npSkip(10); });
    } catch(e) {}
}

function playerPlay() {
    if (usingNativeAudio) nativeAudioEl()?.play().catch(() => {});
    else ytPlayer?.playVideo?.();
}
function playerPause() {
    if (usingNativeAudio) nativeAudioEl()?.pause();
    else ytPlayer?.pauseVideo?.();
}

// ══════════════════════════════════════════════════════════
// ONBOARDING
// ══════════════════════════════════════════════════════════
let obCurrentSlide = 0;
const OB_TOTAL = 3;

function initOnboarding() {
    if (localStorage.getItem('onboarded')) return;
    document.getElementById('onboarding')?.classList.remove('hidden');
}

window.obNext = function() {
    haptic(8);
    obCurrentSlide++;
    if (obCurrentSlide >= OB_TOTAL) { finishOnboarding(); return; }
    document.querySelectorAll('.onboarding-slide').forEach((s, i) => s.classList.toggle('active', i === obCurrentSlide));
    document.querySelectorAll('.onboarding-dot').forEach((d, i) => d.classList.toggle('active', i === obCurrentSlide));
    const btn = document.querySelector('.onboarding-btn');
    if (btn) btn.textContent = obCurrentSlide === OB_TOTAL - 1 ? 'শুরু করুন ✓' : 'পরবর্তী →';
};

window.finishOnboarding = function() {
    localStorage.setItem('onboarded', '1');
    document.getElementById('onboarding')?.classList.add('hidden');
    // Show install prompt after onboarding if available
    setTimeout(checkInstallPrompt, 1000);
};

// ══════════════════════════════════════════════════════════
// PWA INSTALL PROMPT
// ══════════════════════════════════════════════════════════
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (!localStorage.getItem('installDismissed') && localStorage.getItem('onboarded')) {
        setTimeout(() => document.getElementById('install-banner')?.classList.remove('hidden'), 2000);
    }
});

function checkInstallPrompt() {
    if (deferredInstallPrompt && !localStorage.getItem('installDismissed')) {
        document.getElementById('install-banner')?.classList.remove('hidden');
    }
}

window.triggerInstall = async function() {
    haptic(15);
    if (!deferredInstallPrompt) {
        showInstallHelp();
        return;
    }
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById('install-banner')?.classList.add('hidden');
    if (outcome === 'accepted') showToast('✅ Install সম্পন্ন! Home screen-এ দেখুন');
};

window.dismissInstall = function() {
    localStorage.setItem('installDismissed', '1');
    document.getElementById('install-banner')?.classList.add('hidden');
};

window.showInstallHelp = function() {
    showToast('Browser menu → "Add to Home Screen" বা "Install App"');
};

// ══════════════════════════════════════════════════════════
// RATING PROMPT
// ══════════════════════════════════════════════════════════
function checkRatingPrompt() {
    if (localStorage.getItem('ratingShown')) return;
    const total = listeningStats?.total || 0;
    if (total >= 5 && total % 5 === 0) {
        setTimeout(() => document.getElementById('rating-modal')?.classList.remove('hidden'), 1500);
    }
}

window.submitRating = function(score) {
    haptic(20);
    localStorage.setItem('ratingShown', '1');
    closeRatingModal();
    if (score >= 4) {
        showToast('জাযাকাল্লাহু খাইরান! 💚');
    } else {
        showToast('আপনার মতামতের জন্য ধন্যবাদ। আমরা উন্নত করব ইনশাআল্লাহ।');
    }
};
window.closeRatingModal = function() { document.getElementById('rating-modal')?.classList.add('hidden'); };

// ══════════════════════════════════════════════════════════
// TASBEEH COUNTER
// ══════════════════════════════════════════════════════════
const TASBEEH_TYPES = [
    { id: 'subhan', ar: 'سُبْحَانَ اللَّهِ', bn: 'সুবহানাল্লাহ', target: 33 },
    { id: 'alhamd', ar: 'الْحَمْدُ لِلَّهِ', bn: 'আলহামদুলিল্লাহ', target: 33 },
    { id: 'akbar',  ar: 'اللَّهُ أَكْبَرُ', bn: 'আল্লাহু আকবার', target: 34 },
    { id: 'istghfar', ar: 'أَسْتَغْفِرُ اللَّهَ', bn: 'আস্তাগফিরুল্লাহ', target: 100 },
];
let tasbeehState = { type: 'subhan', count: 0, sessionTotal: 0, target: 33 };

window.openTasbeeh = function() {
    haptic(10);
    const modal = document.getElementById('tasbeeh-modal');
    const typesEl = document.getElementById('tasbeeh-types');
    if (!modal) return;
    if (typesEl) typesEl.innerHTML = TASBEEH_TYPES.map(t =>
        `<button onclick="setTasbeehType('${t.id}')" class="tb-type-btn${tasbeehState.type===t.id?' active':''}" id="tb-${t.id}">${t.ar}</button>`
    ).join('');
    renderTasbeehUI();
    modal.classList.remove('hidden');
};
window.closeTasbeeh = function() { document.getElementById('tasbeeh-modal')?.classList.add('hidden'); };

window.setTasbeehType = function(id) {
    haptic(8);
    tasbeehState.type = id;
    const t = TASBEEH_TYPES.find(x => x.id === id);
    if (t) tasbeehState.target = t.target;
    document.querySelectorAll('.tb-type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tb-${id}`)?.classList.add('active');
    renderTasbeehUI();
};

window.tapTasbeeh = function() {
    haptic(5);
    tasbeehState.count++;
    tasbeehState.sessionTotal++;
    if (tasbeehState.count >= tasbeehState.target) {
        haptic(30);
        showToast(`✅ ${tasbeehState.target} সম্পন্ন! আলহামদুলিল্লাহ`);
        tasbeehState.count = 0;
    }
    renderTasbeehUI();
};

window.resetTasbeeh = function() {
    haptic(15);
    tasbeehState.count = 0;
    renderTasbeehUI();
    showToast('রিসেট হয়েছে');
};

window.tasbeehSetTarget = function() {
    const val = prompt('নতুন লক্ষ্য সংখ্যা দিন:', tasbeehState.target);
    if (val && !isNaN(val) && +val > 0) { tasbeehState.target = +val; renderTasbeehUI(); }
};

function renderTasbeehUI() {
    const t = TASBEEH_TYPES.find(x => x.id === tasbeehState.type) || TASBEEH_TYPES[0];
    document.getElementById('tasbeeh-count')?.textContent !== undefined &&
        (document.getElementById('tasbeeh-count').textContent = tasbeehState.count);
    const targetEl = document.getElementById('tasbeeh-target-display');
    if (targetEl) targetEl.textContent = `/${tasbeehState.target}`;
    const arEl = document.getElementById('tasbeeh-arabic-display');
    if (arEl) arEl.textContent = t.ar;
    const bnEl = document.getElementById('tasbeeh-bn-display');
    if (bnEl) bnEl.textContent = `${t.bn} — ট্যাপ করুন`;
    const totEl = document.getElementById('tasbeeh-session-total');
    if (totEl) totEl.textContent = tasbeehState.sessionTotal;
}

// ══════════════════════════════════════════════════════════
// DUA OF THE DAY
// ══════════════════════════════════════════════════════════
const DUAS = [
    { ar: 'رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي', bn: 'হে আমার রব! আমার বুক প্রশস্ত করে দিন এবং আমার কাজ সহজ করে দিন।', source: 'কুরআন ২০:২৫-২৬' },
    { ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ', bn: 'হে আমাদের রব! আমাদের দুনিয়ায় ও আখিরাতে কল্যাণ দিন এবং জাহান্নামের আজাব থেকে রক্ষা করুন।', source: 'কুরআন ২:২০১' },
    { ar: 'رَبِّ زِدْنِي عِلْمًا', bn: 'হে আমার রব! আমার জ্ঞান বৃদ্ধি করুন।', source: 'কুরআন ২০:১১৪' },
    { ar: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', bn: 'আল্লাহই আমাদের জন্য যথেষ্ট এবং তিনিই উত্তম কর্মবিধায়ক।', source: 'কুরআন ৩:১৭৩' },
    { ar: 'رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا', bn: 'হে আমাদের রব! হেদায়াত দেওয়ার পর আমাদের অন্তরকে বিচ্যুত করবেন না।', source: 'কুরআন ৩:৮' },
    { ar: 'اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ', bn: 'হে আল্লাহ! আমি দুশ্চিন্তা ও দুঃখ থেকে আপনার আশ্রয় চাই।', source: 'বুখারি' },
    { ar: 'رَبِّ أَعِنِّي وَلَا تُعِنْ عَلَيَّ وَانْصُرْنِي وَلَا تَنْصُرْ عَلَيَّ', bn: 'হে রব! আমাকে সাহায্য করুন, আমার বিরুদ্ধে সাহায্য করবেন না। আমাকে বিজয়ী করুন, আমার বিরুদ্ধে বিজয়ী করবেন না।', source: 'তিরমিযি' },
    { ar: 'اللَّهُمَّ اشْفِنِي شِفَاءً لَا يُغَادِرُ سَقَمًا', bn: 'হে আল্লাহ! আমাকে এমন সুস্থতা দিন যা কোনো রোগ রেখে যায় না।', source: 'বুখারি' },
    { ar: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ', bn: 'হে আমাদের রব! আমাদের স্ত্রী ও সন্তানদের আমাদের চোখের শীতলতা বানিয়ে দিন।', source: 'কুরআন ২৫:৭৪' },
    { ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ', bn: 'হে আল্লাহ! আমি আপনার কাছে ক্ষমা ও সুস্থতা চাই।', source: 'তিরমিযি' },
    { ar: 'رَبِّ إِنِّي مَسَّنِيَ الضُّرُّ وَأَنتَ أَرْحَمُ الرَّاحِمِينَ', bn: 'হে আমার রব! আমাকে কষ্ট স্পর্শ করেছে, আর আপনি সকল দয়ালুর মধ্যে সর্বাধিক দয়ালু।', source: 'কুরআন ২১:৮৩' },
    { ar: 'اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي', bn: 'হে আল্লাহ! আমার দ্বীন সংশোধন করুন যা আমার কাজের রক্ষাকবচ।', source: 'মুসলিম' },
    { ar: 'لَا إِلَٰهَ إِلَّا أَنتَ سُبْحَانَكَ إِنِّي كُنتُ مِنَ الظَّالِمِينَ', bn: 'আপনি ছাড়া কোনো ইলাহ নেই, আপনি পবিত্র। নিশ্চয়ই আমি জালিমদের অন্তর্ভুক্ত।', source: 'কুরআন ২১:৮৭ (দুআ ইউনুস)' },
    { ar: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ', bn: 'আল্লাহর নামে শুরু করছি যাঁর নামের সাথে কোনো কিছু ক্ষতি করতে পারে না।', source: 'আবু দাউদ' },
];

function getDuaOfDay() {
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    const dayNum = Math.floor((d - start) / 86400000) + 7; // offset from AOTD
    return DUAS[dayNum % DUAS.length];
}

function renderDuaOfDay() {
    const container = document.getElementById('dua-container');
    if (!container) return;
    const dua = getDuaOfDay();
    container.innerHTML = `
        <div class="dua-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span class="dua-badge">🤲 আজকের দুআ</span>
            </div>
            <p class="dua-arabic">${dua.ar}</p>
            <p class="dua-bn">${dua.bn}</p>
            <p class="dua-source">${dua.source}</p>
            <button onclick="copyDua('${encodeURIComponent(dua.ar)}','${encodeURIComponent(dua.bn)}')" class="dua-copy-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                আরবি কপি করুন
            </button>
        </div>`;
}

window.copyDua = function(arEnc, bnEnc) {
    haptic(10);
    const text = `${decodeURIComponent(arEnc)}\n\n${decodeURIComponent(bnEnc)}`;
    navigator.clipboard.writeText(text).then(() => showToast('দুআ কপি হয়েছে ✅'));
};

// ══════════════════════════════════════════════════════════
// ARABIC TEXT COPY (on audio cards)
// ══════════════════════════════════════════════════════════
window.copyArabic = function(ar) {
    haptic(8);
    navigator.clipboard.writeText(ar).then(() => showToast('আরবি কপি হয়েছে ✅'));
};

// ══════════════════════════════════════════════════════════
// PDF BOOKMARKS
// ══════════════════════════════════════════════════════════
let pdfBookmarks = JSON.parse(localStorage.getItem('pdfBookmarks') || '{}');
// {pdfId: pageNumber}

window.savePdfBookmark = function(id, inputId) {
    haptic(10);
    const input = document.getElementById(inputId);
    const page = parseInt(input?.value);
    if (!page || page < 1) { showToast('বৈধ পেজ নম্বর দিন'); return; }
    pdfBookmarks[id] = page;
    localStorage.setItem('pdfBookmarks', JSON.stringify(pdfBookmarks));
    const savedEl = document.getElementById(`bm-saved-${id}`);
    if (savedEl) savedEl.textContent = `📌 পেজ ${page} সেভ হয়েছে`;
    showToast(`📌 পেজ ${page} bookmark করা হয়েছে`);
};

// ══════════════════════════════════════════════════════════
// ENHANCED STATS (heatmap + category breakdown + personal best)
// ══════════════════════════════════════════════════════════

// Update recordPlay to also track daily dates and category
function recordPlay(code) {
    listeningStats.plays[code] = (listeningStats.plays[code] || 0) + 1;
    listeningStats.total = (listeningStats.total || 0) + 1;
    // Daily tracking for heatmap
    const today = todayStr();
    if (!listeningStats.dates) listeningStats.dates = {};
    listeningStats.dates[today] = (listeningStats.dates[today] || 0) + 1;
    // Personal best
    const todayCount = listeningStats.dates[today];
    if (!listeningStats.bestDay || todayCount > (listeningStats.dates[listeningStats.bestDay] || 0)) {
        listeningStats.bestDay = today;
    }
    // Category tracking
    const item = audioData.find(a => a.code === code);
    if (item) {
        if (!listeningStats.categories) listeningStats.categories = {};
        listeningStats.categories[item.category] = (listeningStats.categories[item.category] || 0) + 1;
    }
    localStorage.setItem('listeningStats', JSON.stringify(listeningStats));
    updateStreak();
    updateWeeklyGoal();
    checkRatingPrompt();
}

function renderHeatmap() {
    const dates = listeningStats.dates || {};
    const cells = [];
    const today = new Date();
    for (let i = 83; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const count = dates[key] || 0;
        const level = count === 0 ? 0 : count <= 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
        const dayNames = ['রবি','সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি'];
        cells.push(`<div class="heatmap-cell level-${level}" title="${key}: ${count} টি অডিও"></div>`);
    }
    return `
        <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin:16px 0 8px">শ্রবণ ইতিহাস (১২ সপ্তাহ)</p>
        <div class="heatmap-grid">${cells.join('')}</div>
        <div style="display:flex;align-items:center;gap:4px;margin-top:6px">
            <span style="font-size:0.65rem;color:var(--text-dim)">কম</span>
            ${[0,1,2,3,4].map(l => `<div class="heatmap-cell level-${l}" style="width:12px;height:12px"></div>`).join('')}
            <span style="font-size:0.65rem;color:var(--text-dim)">বেশি</span>
        </div>`;
}

function renderCategoryBreakdown() {
    const cats = listeningStats.categories || {};
    const sorted = Object.entries(cats).sort((a,b) => b[1]-a[1]).slice(0, 6);
    if (!sorted.length) return '';
    const max = sorted[0][1];
    return `
        <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin:16px 0 10px">ক্যাটাগরি</p>
        ${sorted.map(([cat, count]) => `
            <div class="cat-bar-row">
                <div class="cat-bar-header">
                    <span>${cat}</span>
                    <span style="color:var(--green);font-weight:700">${count}×</span>
                </div>
                <div class="cat-bar-track">
                    <div class="cat-bar-fill" style="width:${Math.round((count/max)*100)}%"></div>
                </div>
            </div>`).join('')}`;
}

// ══════════════════════════════════════════════════════════
// DAILY ROUTINE — Shared helpers
// ══════════════════════════════════════════════════════════
function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekStartStr() {
    const d = new Date();
    const dow = d.getDay(); // 0=Sun
    const diff = dow === 0 ? -6 : 1 - dow; // Monday
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,'0')}-${String(mon.getDate()).padStart(2,'0')}`;
}
function dayBeforeStr(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Audio of the Day ─────────────────────────────────────
let aotdListened = JSON.parse(localStorage.getItem('aotdListened') || '{"date":"","code":""}');

function getDailyAudioCode() {
    if (!audioData.length) return null;
    // Deterministic: use day-of-year so it's consistent across devices
    const d = new Date();
    const start = new Date(d.getFullYear(), 0, 0);
    const dayNum = Math.floor((d - start) / 86400000);
    return audioData[dayNum % audioData.length]?.code || audioData[0].code;
}

function renderAudioOfTheDay() {
    const container = document.getElementById('aotd-container');
    if (!container || !audioData.length) return;
    const code = getDailyAudioCode();
    const item = audioData.find(a => a.code === code);
    if (!item) return;
    const today = todayStr();
    const done = aotdListened.date === today && aotdListened.code === code;
    container.innerHTML = `
        <div class="aotd-card">
            <div class="aotd-header">
                <span class="aotd-badge">✨ আজকের রুকিয়াহ</span>
                ${done ? '<span class="aotd-done-badge">✓ শোনা হয়েছে</span>' : ''}
            </div>
            <p class="aotd-title">${item.title_bn}</p>
            ${item.title_ar ? `<p class="aotd-ar">${item.title_ar}</p>` : ''}
            <div class="aotd-meta">
                <span class="code-badge">${item.code}</span>
                <span class="cat-label">${item.category}</span>
            </div>
            <button onclick="openPlayer('${item.code}');markAotdListened('${item.code}')" class="btn-play" style="width:100%">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                ${done ? 'আবার শুনুন' : 'এখনই শুনুন'}
            </button>
        </div>`;
}

window.markAotdListened = function(code) {
    aotdListened = { date: todayStr(), code };
    localStorage.setItem('aotdListened', JSON.stringify(aotdListened));
    setTimeout(renderAudioOfTheDay, 400);
};

// ── Listening Streak ─────────────────────────────────────
let streakData = JSON.parse(localStorage.getItem('streakData') || '{"streak":0,"longest":0,"lastDate":""}');

function updateStreak() {
    const today = todayStr();
    if (streakData.lastDate === today) return; // already counted today
    const yesterday = dayBeforeStr(today);
    if (streakData.lastDate === yesterday) {
        streakData.streak++;
    } else if (streakData.lastDate !== '') {
        streakData.streak = 1; // missed a day
    } else {
        streakData.streak = 1; // first ever play
    }
    streakData.lastDate = today;
    streakData.longest = Math.max(streakData.longest, streakData.streak);
    localStorage.setItem('streakData', JSON.stringify(streakData));
    renderStreakWidget();
}

function renderStreakWidget() {
    const numEl  = document.getElementById('streak-count');
    const longEl = document.getElementById('streak-longest');
    if (!numEl) return;
    numEl.textContent = streakData.streak;
    if (longEl) longEl.textContent = streakData.longest > streakData.streak
        ? `সর্বোচ্চ: ${streakData.longest} দিন` : '';
}

// ── Weekly Goal ──────────────────────────────────────────
let goalData = JSON.parse(localStorage.getItem('goalData') || '{"goal":7,"weekStart":"","playsThisWeek":0}');

const GOAL_PRESETS = [3, 5, 7, 10, 14, 21];

function updateWeeklyGoal() {
    const thisWeek = weekStartStr();
    if (goalData.weekStart !== thisWeek) {
        goalData.weekStart = thisWeek;
        goalData.playsThisWeek = 0;
    }
    goalData.playsThisWeek++;
    localStorage.setItem('goalData', JSON.stringify(goalData));
    if (goalData.playsThisWeek === goalData.goal && Notification.permission === 'granted') {
        new Notification('🎉 সাপ্তাহিক লক্ষ্য পূরণ!', {
            body: `মাশাআল্লাহ! এই সপ্তাহে ${goalData.goal}টি রুকিয়াহ অডিও শুনেছেন।`,
        });
    }
    renderGoalWidget();
}

function renderGoalWidget() {
    const countEl  = document.getElementById('goal-count-text');
    const fillEl   = document.getElementById('goal-bar-fill');
    const statusEl = document.getElementById('goal-status-text');
    const widgetEl = document.getElementById('goal-widget');
    if (!countEl) return;

    const thisWeek = weekStartStr();
    if (goalData.weekStart !== thisWeek) { goalData.playsThisWeek = 0; }

    const done = goalData.playsThisWeek >= goalData.goal;
    const pct  = Math.min(100, Math.round((goalData.playsThisWeek / goalData.goal) * 100));

    countEl.textContent = `${goalData.playsThisWeek}/${goalData.goal}`;
    countEl.className   = `goal-count-text${done ? ' goal-done-text' : ''}`;
    if (fillEl) { fillEl.style.width = pct + '%'; fillEl.className = 'goal-bar-fill' + (done ? ' done' : ''); }
    if (statusEl) statusEl.textContent = done ? '✓ লক্ষ্য পূরণ!' : `${goalData.goal - goalData.playsThisWeek} টি বাকি`;
    if (widgetEl && done) widgetEl.style.borderColor = 'rgba(74,222,128,0.25)';
}

window.openGoalModal = function() {
    const modal = document.getElementById('goal-modal');
    const grid  = document.getElementById('goal-presets');
    if (!modal || !grid) return;
    grid.innerHTML = GOAL_PRESETS.map(n => `
        <button onclick="setWeeklyGoal(${n})" class="goal-preset-btn${goalData.goal === n ? ' active' : ''}">
            <span style="font-size:1.1rem;display:block;margin-bottom:2px">${n}</span>
            <span style="font-size:0.68rem;font-weight:600;color:inherit;opacity:0.8">অডিও/সপ্তাহ</span>
        </button>`).join('');
    modal.classList.remove('hidden');
};
window.closeGoalModal = function() { document.getElementById('goal-modal')?.classList.add('hidden'); };
window.setWeeklyGoal = function(n) {
    goalData.goal = n;
    localStorage.setItem('goalData', JSON.stringify(goalData));
    closeGoalModal();
    renderGoalWidget();
    showToast(`🎯 সাপ্তাহিক লক্ষ্য: ${n} টি অডিও`);
};

// ── Daily Reminder ───────────────────────────────────────
let reminderData = JSON.parse(localStorage.getItem('reminderData') || '{"enabled":false,"time":"06:00","label":"","lastShown":""}');

const REMINDER_PRESETS = [
    { time: '05:00', label: '🌅 ফজরের পর', display: '৫:০০ AM' },
    { time: '07:00', label: '☀️ সকাল',     display: '৭:০০ AM' },
    { time: '13:00', label: '🕐 দুপুর',     display: '১:০০ PM' },
    { time: '17:30', label: '🌇 আসরের পর', display: '৫:৩০ PM' },
    { time: '20:00', label: '🌙 এশার পর',  display: '৮:০০ PM' },
    { time: '22:00', label: '🌌 রাত',       display: '১০:০০ PM' },
];

window.openReminderModal = function() {
    const modal = document.getElementById('reminder-modal');
    const grid  = document.getElementById('reminder-presets');
    const input = document.getElementById('reminder-time-input');
    const disBtn = document.getElementById('reminder-disable-btn');
    if (!modal) return;
    if (grid) grid.innerHTML = REMINDER_PRESETS.map(p => `
        <button onclick="selectReminderPreset('${p.time}','${p.label}')" class="reminder-preset-btn${reminderData.enabled && reminderData.time === p.time ? ' active' : ''}" id="rp-${p.time.replace(':','')}">
            ${p.label}<br><span style="font-size:0.7rem;opacity:0.7">${p.display}</span>
        </button>`).join('');
    if (input) input.value = reminderData.time || '06:00';
    if (disBtn) disBtn.classList.toggle('hidden', !reminderData.enabled);
    modal.classList.remove('hidden');
};

window.selectReminderPreset = function(time, label) {
    const input = document.getElementById('reminder-time-input');
    if (input) input.value = time;
    document.querySelectorAll('.reminder-preset-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`rp-${time.replace(':','')}`)?.classList.add('active');
};

window.closeReminderModal = function() { document.getElementById('reminder-modal')?.classList.add('hidden'); };

window.saveReminder = async function() {
    if (Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('Notification permission দিন'); return; }
    }
    const input = document.getElementById('reminder-time-input');
    const time = input?.value || '06:00';
    const preset = REMINDER_PRESETS.find(p => p.time === time);
    reminderData = { enabled: true, time, label: preset?.label || `⏰ ${time}`, lastShown: reminderData.lastShown };
    localStorage.setItem('reminderData', JSON.stringify(reminderData));
    closeReminderModal();
    renderReminderRow();
    updateNotifBtn();
    showToast(`⏰ রিমাইন্ডার সেট: ${preset?.label || time}`);
};

window.disableReminder = function() {
    reminderData.enabled = false;
    localStorage.setItem('reminderData', JSON.stringify(reminderData));
    closeReminderModal();
    renderReminderRow();
    showToast('রিমাইন্ডার বন্ধ করা হয়েছে');
};

function renderReminderRow() {
    const row    = document.getElementById('reminder-row');
    const text   = document.getElementById('reminder-status-text');
    const btn    = document.getElementById('reminder-set-btn');
    if (!row) return;
    if (reminderData.enabled) {
        row.classList.add('reminder-on');
        if (text) text.textContent = `${reminderData.label || reminderData.time} — চালু আছে ✓`;
        if (btn)  btn.textContent  = 'পরিবর্তন';
    } else {
        row.classList.remove('reminder-on');
        if (text) text.textContent = 'বন্ধ আছে';
        if (btn)  btn.textContent  = 'সেট করুন';
    }
}

function checkDailyReminder() {
    if (!reminderData.enabled || Notification.permission !== 'granted') return;
    const today = todayStr();
    if (reminderData.lastShown === today) return;
    const now = new Date();
    const [rH, rM] = (reminderData.time || '06:00').split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= rH * 60 + rM) {
        reminderData.lastShown = today;
        localStorage.setItem('reminderData', JSON.stringify(reminderData));
        new Notification('🌿 রুকিয়াহর সময় হয়েছে!', {
            body: 'আজকের রুকিয়াহ তিলাওয়াত শুরু করুন। আল্লাহর রহমত ও শিফা নিন।',
        });
    }
}

function renderDailySection() {
    renderAudioOfTheDay();
    renderDuaOfDay();
    renderStreakWidget();
    renderGoalWidget();
    renderReminderRow();
}

// ══════════════════════════════════════════════════════════
// FEATURE 1: Push Notifications
// ══════════════════════════════════════════════════════════
window.requestNotifications = async function() {
    if (!('Notification' in window)) { showToast('এই ব্রাউজারে notification নেই'); return; }
    if (Notification.permission === 'granted') { showToast('Notification ইতোমধ্যে চালু আছে ✅'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        showToast('✅ Notification চালু হয়েছে!');
        localStorage.setItem('notifEnabled', '1');
        updateNotifBtn();
        new Notification('🌿 Al Quranic Ruqyah Healing', {
            body: 'Notification চালু হয়েছে! নতুন অডিও/PDF এলে জানাবো।',
        });
    } else {
        showToast('Notification permission দেওয়া হয়নি');
    }
};

function updateNotifBtn() {
    const btn = document.getElementById('notif-btn');
    if (!btn) return;
    const on = Notification.permission === 'granted';
    btn.classList.toggle('active', on);
    btn.title = on ? 'Notification চালু আছে ✅' : 'Notification চালু করুন';
}

function checkForNewContent() {
    const lastCount = parseInt(localStorage.getItem('lastAudioCount') || '0');
    if (audioData.length > lastCount && lastCount > 0 && Notification.permission === 'granted') {
        new Notification('🌿 নতুন কন্টেন্ট!', {
            body: `${audioData.length - lastCount}টি নতুন রুকিয়াহ অডিও যোগ হয়েছে!`,
        });
    }
    localStorage.setItem('lastAudioCount', audioData.length);
}

// ══════════════════════════════════════════════════════════
// FEATURE 2: YouTube Progress Tracking
// ══════════════════════════════════════════════════════════
const videoProgress = JSON.parse(localStorage.getItem('videoProgress') || '{}');
let ytPlayer = null;
let ytProgressTimer = null;

function loadYouTubeAPI() {
    if (window.YT || document.getElementById('yt-api-script')) return;
    const tag = document.createElement('script');
    tag.id = 'yt-api-script';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function() { /* API ready — player created on demand */ };

function createYTPlayer(videoId, startSeconds) {
    clearInterval(ytProgressTimer);
    if (ytPlayer && typeof ytPlayer.destroy === 'function') ytPlayer.destroy();
    ytPlayer = null;

    if (!window.YT || !window.YT.Player) {
        // Fallback: plain iframe
        const frame = document.getElementById('yt-frame');
        if (frame) frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&start=${Math.floor(startSeconds||0)}" style="position:absolute;inset:0;width:100%;height:100%;border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
        return;
    }

    ytPlayer = new YT.Player('yt-frame', {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, start: Math.floor(startSeconds || 0) },
        events: {
            onStateChange(ev) {
                if (!currentPlayerItem) return;
                if (ev.data === 1) { // playing
                    updateMediaSession(currentPlayerItem);
                    try { ytPlayer?.setPlaybackRate?.(playbackSpeed); } catch(e) {}
                    ytProgressTimer = setInterval(() => {
                        try {
                            const t = ytPlayer?.getCurrentTime?.();
                            if (t > 5) {
                                videoProgress[currentPlayerItem.code] = t;
                                localStorage.setItem('videoProgress', JSON.stringify(videoProgress));
                            }
                        } catch(e) {}
                    }, 5000);
                } else if (ev.data === 0) { // ended
                    clearInterval(ytProgressTimer);
                    handleYTEnded();
                } else {
                    clearInterval(ytProgressTimer);
                }
            }
        }
    });
}

// ══════════════════════════════════════════════════════════
// FEATURE 3: Sleep Timer
// ══════════════════════════════════════════════════════════
let sleepTimeout = null, sleepInterval = null, sleepEnd = null;

window.toggleSleepTimerPicker = function() {
    const picker = document.getElementById('sleep-picker');
    if (picker) picker.classList.toggle('hidden');
};

window.setSleepTimer = function(minutes) {
    document.getElementById('sleep-picker')?.classList.add('hidden');
    clearSleepTimerState();
    sleepEnd = Date.now() + minutes * 60000;
    sleepTimeout = setTimeout(() => {
        closePlayer();
        clearSleepTimerState();
        showToast('⏱️ Sleep timer শেষ — player বন্ধ');
    }, minutes * 60000);
    sleepInterval = setInterval(renderSleepDisplay, 1000);
    renderSleepDisplay();
    showToast(`⏱️ Sleep timer: ${minutes} মিনিট`);
    document.getElementById('sleep-timer-btn').style.color = 'var(--green)';
};

window.clearSleepTimer = function() {
    clearSleepTimerState();
    document.getElementById('sleep-picker')?.classList.add('hidden');
    showToast('Sleep timer বাতিল হয়েছে');
};

function clearSleepTimerState() {
    clearTimeout(sleepTimeout); clearInterval(sleepInterval);
    sleepTimeout = sleepInterval = sleepEnd = null;
    const display = document.getElementById('sleep-timer-display');
    if (display) display.style.display = 'none';
    const btn = document.getElementById('sleep-timer-btn');
    if (btn) btn.style.color = '';
}

function renderSleepDisplay() {
    const display = document.getElementById('sleep-timer-display');
    if (!display || !sleepEnd) return;
    const rem = Math.max(0, sleepEnd - Date.now());
    const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
    display.style.display = 'inline';
    display.textContent = `${m}:${s.toString().padStart(2,'0')}`;
}

// ══════════════════════════════════════════════════════════
// FEATURE 4: Listening Stats
// ══════════════════════════════════════════════════════════
// recordPlay lives with the enhanced-stats block above. A second, simpler
// copy used to sit here; being the later declaration it silently won, so the
// heatmap/personal-best/category data was never written.

window.showStatsModal = function() {
    const modal = document.getElementById('stats-modal');
    const content = document.getElementById('stats-content');
    if (!modal || !content) return;

    const total = listeningStats.total || 0;
    const unique = Object.keys(listeningStats.plays).length;
    const topPlayed = Object.entries(listeningStats.plays)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([code, count]) => {
            const item = audioData.find(a => a.code === code);
            return item ? { title: item.title_bn, code, count } : null;
        }).filter(Boolean);

    const bestDay = listeningStats.bestDay;
    const bestCount = bestDay && listeningStats.dates ? (listeningStats.dates[bestDay] || 0) : 0;
    const streak = streakData.streak || 0;

    content.innerHTML = `
        <p class="modal-title">📊 লিসেনিং স্ট্যাটস</p>
        <div class="grid-3" style="margin-bottom:14px;gap:10px">
            <div class="stat-card"><div class="stat-num">${total}</div><div class="stat-label">মোট প্লে</div></div>
            <div class="stat-card"><div class="stat-num">${streak}</div><div class="stat-label">🔥 Streak</div></div>
            <div class="stat-card"><div class="stat-num">${unique}</div><div class="stat-label">ভিন্ন অডিও</div></div>
        </div>
        ${bestDay && bestCount > 0 ? `
            <div style="background:var(--raised);border-radius:var(--r-md);padding:10px 12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:0.82rem;color:var(--text-sub)">🏆 সেরা দিন</span>
                <span style="font-size:0.82rem;font-weight:700">${bestDay} — <span style="color:var(--green)">${bestCount} টি</span></span>
            </div>` : ''}
        ${renderHeatmap()}
        ${renderCategoryBreakdown()}
        ${topPlayed.length ? `
            <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin:16px 0 10px">সর্বাধিক শোনা</p>
            <div class="space-y-sm">
                ${topPlayed.map((item, i) => `
                    <div class="stats-row">
                        <span class="stats-rank">${i + 1}</span>
                        <div class="mn-0" style="flex:1">
                            <p class="clamp1" style="font-size:0.875rem;font-weight:600">${item.title}</p>
                            <p style="font-size:0.7rem;color:var(--text-dim)">${item.code}</p>
                        </div>
                        <span style="font-size:0.85rem;font-weight:700;color:var(--green)">${item.count}×</span>
                    </div>
                `).join('')}
            </div>
        ` : `<p style="color:var(--text-dim);text-align:center;padding:24px 0;font-size:0.875rem">এখনো কোনো অডিও শোনা হয়নি</p>`}
        ${total > 0 ? `<button onclick="if(confirm('সব stats মুছবেন?')){listeningStats={plays:{},total:0,dates:{},categories:{}};localStorage.removeItem('listeningStats');closeStatsModal();showToast('Stats মুছে ফেলা হয়েছে')}" style="margin-top:16px;width:100%;padding:9px;border-radius:var(--r-md);background:none;border:1px solid rgba(255,100,100,0.2);color:#ff6b6b;font-weight:600;font-size:0.78rem;cursor:pointer;font-family:inherit">Stats রিসেট করুন</button>` : ''}
    `;
    modal.classList.remove('hidden');
};
window.closeStatsModal = function() { document.getElementById('stats-modal')?.classList.add('hidden'); };

// ══════════════════════════════════════════════════════════
// FEATURE 5: Playlists
// ══════════════════════════════════════════════════════════
let playlists = JSON.parse(localStorage.getItem('playlists') || '[]');

function savePlaylists() {
    localStorage.setItem('playlists', JSON.stringify(playlists));
    saveToCloud('playlists', playlists);
}

window.openPlaylistModal = function() {
    document.getElementById('playlist-modal')?.classList.remove('hidden');
    renderPlaylistModal();
};
window.closePlaylistModal = function() { document.getElementById('playlist-modal')?.classList.add('hidden'); };

function renderPlaylistModal() {
    const content = document.getElementById('playlist-content');
    if (!content) return;
    content.innerHTML = `
        <p class="modal-title">🔖 আমার Playlists</p>
        ${playlists.length === 0
            ? `<p style="color:var(--text-dim);text-align:center;padding:24px 0;font-size:0.875rem">কোনো playlist নেই</p>`
            : playlists.map(pl => {
                const items = pl.codes.map(c => audioData.find(a => a.code === c)).filter(Boolean);
                return `<div class="pl-item">
                    <div class="pl-item-header">
                        <div>
                            <p class="pl-item-name">${pl.name}</p>
                            <p class="pl-item-meta">${items.length} টি অডিও</p>
                        </div>
                        <div style="display:flex;gap:6px">
                            ${items.length ? `<button onclick="playPlaylistById('${pl.id}')" class="btn-primary" style="padding:7px 13px;font-size:0.78rem">▶ Play All</button>` : ''}
                            <button onclick="deletePlaylist('${pl.id}')" style="width:34px;height:34px;border-radius:var(--r-md);background:none;border:1px solid rgba(255,100,100,0.2);color:#ff6b6b;cursor:pointer;font-size:0.9rem">✕</button>
                        </div>
                    </div>
                    <div class="pl-item-tracks">
                        ${items.slice(0, 3).map(it => `<p class="pl-track clamp1">· ${it.title_bn}</p>`).join('')}
                        ${items.length > 3 ? `<p class="pl-track" style="color:var(--text-dim)">...এবং আরো ${items.length - 3} টি</p>` : ''}
                    </div>
                </div>`;
            }).join('')
        }
        <div style="display:flex;gap:8px;margin-top:14px">
            <input id="new-pl-name" placeholder="নতুন playlist নাম..." class="search-bar" style="margin:0;flex:1">
            <button onclick="createNewPlaylist()" class="btn-primary" style="white-space:nowrap;padding:10px 14px;font-size:0.82rem">তৈরি করুন</button>
        </div>
    `;
}

window.createNewPlaylist = function() {
    const input = document.getElementById('new-pl-name');
    const name = input?.value?.trim();
    if (!name) return;
    playlists.push({ id: Date.now().toString(), name, codes: [] });
    savePlaylists();
    if (input) input.value = '';
    renderPlaylistModal();
};

window.deletePlaylist = function(id) {
    playlists = playlists.filter(p => p.id !== id);
    savePlaylists();
    renderPlaylistModal();
};

window.openAddToPlaylist = function(code) {
    const modal = document.getElementById('add-playlist-modal');
    const content = document.getElementById('add-playlist-content');
    if (!modal || !content) return;
    const item = audioData.find(a => a.code === code);
    content.innerHTML = `
        <p class="modal-title">🔖 Playlist-এ যোগ করুন</p>
        ${item ? `<p class="clamp1" style="font-size:0.82rem;color:var(--text-sub);margin-bottom:14px">${item.title_bn}</p>` : ''}
        ${playlists.length === 0
            ? `<p style="color:var(--text-dim);font-size:0.875rem;margin-bottom:14px">কোনো playlist নেই — নিচে তৈরি করুন</p>`
            : playlists.map(pl => {
                const isIn = pl.codes.includes(code);
                return `<div class="add-pl-item">
                    <span style="font-size:0.875rem;font-weight:600">${pl.name} <span style="color:var(--text-dim)">(${pl.codes.length})</span></span>
                    <button onclick="toggleInPlaylist('${pl.id}','${code}')" style="padding:6px 14px;border-radius:var(--r-md);border:none;font-weight:700;font-size:0.78rem;cursor:pointer;background:${isIn ? 'var(--overlay)' : 'var(--green)'};color:${isIn ? 'var(--text-sub)' : '#000'};font-family:inherit">
                        ${isIn ? '✓ আছে' : '+ যোগ'}
                    </button>
                </div>`;
            }).join('')
        }
        <div style="display:flex;gap:8px;margin-top:12px">
            <input id="new-pl-name-quick" placeholder="নতুন playlist..." class="search-bar" style="margin:0;flex:1">
            <button onclick="createAndAdd('${code}')" class="btn-primary" style="white-space:nowrap;padding:10px 14px;font-size:0.82rem">তৈরি ও যোগ</button>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.toggleInPlaylist = function(id, code) {
    const pl = playlists.find(p => p.id === id);
    if (!pl) return;
    const idx = pl.codes.indexOf(code);
    if (idx === -1) { pl.codes.push(code); showToast(`"${pl.name}"-এ যোগ হয়েছে ✅`); }
    else { pl.codes.splice(idx, 1); showToast(`"${pl.name}" থেকে সরানো হয়েছে`); }
    savePlaylists();
    openAddToPlaylist(code);
};

window.createAndAdd = function(code) {
    const input = document.getElementById('new-pl-name-quick');
    const name = input?.value?.trim();
    if (!name) return;
    const pl = { id: Date.now().toString(), name, codes: [code] };
    playlists.push(pl);
    savePlaylists();
    showToast(`"${name}" playlist তৈরি ও যোগ হয়েছে ✅`);
    closeAddPlaylistModal();
};

window.closeAddPlaylistModal = function() { document.getElementById('add-playlist-modal')?.classList.add('hidden'); };

let currentPlaylistQueue = [], currentPlaylistPos = 0;

window.playPlaylistById = function(id) {
    const pl = playlists.find(p => p.id === id);
    if (!pl || !pl.codes.length) return;
    currentPlaylistQueue = [...pl.codes];
    currentPlaylistPos = 0;
    closePlaylistModal();
    openPlayer(currentPlaylistQueue[0]);
    showToast(`▶ "${pl.name}" playlist চালু হয়েছে`);
};

// ══════════════════════════════════════════════════════════
// FEATURE 6: WhatsApp Share
// ══════════════════════════════════════════════════════════
window.shareWhatsApp = async function(code, titleBn, url) {
    haptic(10);
    const text = `🌿 *Al Quranic Ruqyah Healing*\n\n*${titleBn}* (${code})`;
    try {
        if (window.Capacitor && window.Capacitor.isPluginAvailable('Share')) {
            const Share = window.Capacitor.Plugins.Share;
            await Share.share({
                title: 'Ruqyah Healing',
                text: `${text}\n\n${url}\n\n_al-quranic-ruqyah-healing.vercel.app_`,
                dialogTitle: 'শেয়ার করুন',
            });
        } else if (navigator.share) {
            await navigator.share({
                title: 'Ruqyah Healing',
                text: text,
                url: url
            });
        } else {
            const waText = `🌿 *Al Quranic Ruqyah Healing*\n\n*${titleBn}* (${code})\n\n${url}\n\n_al-quranic-ruqyah-healing.vercel.app_`;
            openExternal(`https://wa.me/?text=${encodeURIComponent(waText)}`);
        }
    } catch(e) {
        const waText = `🌿 *Al Quranic Ruqyah Healing*\n\n*${titleBn}* (${code})\n\n${url}\n\n_al-quranic-ruqyah-healing.vercel.app_`;
        openExternal(`https://wa.me/?text=${encodeURIComponent(waText)}`);
    }
};

// ══════════════════════════════════════════════════════════
// FEATURE 7: Voice Search
// ══════════════════════════════════════════════════════════
function initVoiceSearch() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const btn = document.getElementById('voice-search-btn');
    if (!SR || !btn) return;
    btn.classList.remove('hidden');
    const recognition = new SR();
    recognition.lang = 'bn-BD';
    recognition.continuous = false;
    recognition.interimResults = false;
    let isListening = false;
    btn.addEventListener('click', () => {
        if (isListening) { recognition.stop(); return; }
        isListening = true;
        btn.classList.add('listening');
        recognition.start();
    });
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        const input = document.getElementById('global-search-input');
        if (input) { input.value = transcript; renderSearchResults(transcript); }
    };
    const stop = () => { isListening = false; btn.classList.remove('listening'); };
    recognition.onerror = stop;
    recognition.onend   = stop;
}

// ══════════════════════════════════════════════════════════
// THE player entry point — resume, repeat, sleep timer, speed,
// downloads, and the native-MP3 branch all hang off this.
// ══════════════════════════════════════════════════════════
function openPlayer(code) {
    const item = audioData.find(a => a.code === code);
    if (!item) return;
    currentPlayerItem = item;
    addToRecentlyPlayed(code);
    recordPlay(code);

    const modal = document.getElementById('yt-modal');
    const titleEl = document.getElementById('yt-modal-title');
    const codeEl  = document.getElementById('yt-modal-code');
    const extLink = document.getElementById('yt-external-link');

    const videoId = getYouTubeId(item.url);
    const savedTime = videoProgress[code] || 0;

    if (titleEl) titleEl.textContent = item.title_bn;
    if (codeEl)  {
        const progBadge = savedTime > 10 ? ` <span class="yt-progress-badge">↩ Resume</span>` : '';
        codeEl.innerHTML = item.code + progBadge;
    }
    if (extLink) extLink.href = item.url;

    updatePlayerFavBtn();
    updatePlayerModeButtons();
    updateMediaSession(item);
    repeatDone = 0;
    renderRepeatProgress();
    updateSpeedLabel();
    updateDownloadBtn(item);

    const related = audioData.filter(a => a.category === item.category && a.code !== code).slice(0, 8);
    const relatedContainer = document.getElementById('yt-related');
    if (relatedContainer) {
        relatedContainer.innerHTML = related.length ? `
            <p style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-dim);margin-bottom:10px">আরো দেখুন</p>
            ${related.map(r => {
                const rProgress = videoProgress[r.code] || 0;
                return `<div class="yt-related-item" onclick="openPlayer('${r.code}')">
                    <div class="yt-related-thumb">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <div class="mn-0" style="flex:1">
                        <p class="clamp2" style="font-size:0.85rem;font-weight:600;line-height:1.35">${r.title_bn}</p>
                        <p style="font-size:0.7rem;color:var(--text-dim);margin-top:2px">${r.code}${rProgress > 10 ? ' · ↩' : ''}</p>
                    </div>
                </div>`;
            }).join('')}
        ` : `<p style="font-size:0.8rem;color:var(--text-dim);text-align:center;padding:20px 0">আর কোনো ভিডিও নেই</p>`;
    }

    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }

    // Native MP3 path: plays in background with lock-screen controls
    const ytWrap = document.getElementById('yt-player-wrap');
    const npEl = document.getElementById('native-player');
    if (item.audio) {
        usingNativeAudio = true;
        clearInterval(ytProgressTimer);
        if (ytPlayer && typeof ytPlayer.destroy === 'function') { ytPlayer.destroy(); ytPlayer = null; }
        const frame = document.getElementById('yt-frame');
        if (frame) frame.innerHTML = '';
        if (ytWrap) ytWrap.style.display = 'none';
        if (npEl) npEl.classList.remove('hidden');
        startNativePlayback(item, savedTime);
        return;
    }
    usingNativeAudio = false;
    stopNativeAudio();
    if (npEl) npEl.classList.add('hidden');
    if (ytWrap) ytWrap.style.display = '';

    // Create player (YT API or fallback)
    if (videoId) {
        if (window.YT && window.YT.Player) {
            createYTPlayer(videoId, savedTime);
        } else {
            const frame = document.getElementById('yt-frame');
            if (frame) frame.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0${savedTime > 10 ? '&start=' + Math.floor(savedTime) : ''}" style="position:absolute;inset:0;width:100%;height:100%;border:none" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
            // Retry with YT API once loaded
            if (!window.YT) {
                const check = setInterval(() => {
                    if (window.YT && window.YT.Player && currentPlayerItem?.code === code) {
                        clearInterval(check);
                        createYTPlayer(videoId, savedTime);
                    }
                }, 500);
            }
        }
    }
}
window.openPlayer = openPlayer;

// Tears down whichever engine is running — YT iframe or native audio.
function closePlayer() {
    clearInterval(ytProgressTimer);
    if (ytPlayer && typeof ytPlayer.destroy === 'function') { ytPlayer.destroy(); ytPlayer = null; }
    stopNativeAudio();
    usingNativeAudio = false;
    repeatDone = 0;
    const frame = document.getElementById('yt-frame');
    if (frame) frame.innerHTML = '';
    const modal = document.getElementById('yt-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    currentPlayerItem = null;
}
window.closePlayer = closePlayer;

// ══════════════════════════════════════════════════════════
// v2.1 — NATIVE AUDIO ENGINE (background MP3 playback)
// Tracks with an "audio" field in audio.json play through this
// engine: works with screen off, lock-screen controls, offline.
// ══════════════════════════════════════════════════════════
let usingNativeAudio = false;
let npLastSave = 0;

function toBn(n) { return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }

function nativeAudioEl() { return document.getElementById('native-audio'); }

function fmtTime(sec) {
    if (!isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function startNativePlayback(item, startSeconds) {
    const a = nativeAudioEl();
    if (!a) return;
    a.src = item.audio;
    a.playbackRate = playbackSpeed;
    if (startSeconds > 10) {
        a.addEventListener('loadedmetadata', function once() {
            a.removeEventListener('loadedmetadata', once);
            try { a.currentTime = Math.min(startSeconds, Math.max(0, (a.duration || startSeconds) - 1)); } catch(e) {}
        });
    }
    a.play().catch(() => {});
}

function stopNativeAudio() {
    const a = nativeAudioEl();
    if (!a) return;
    a.pause();
    a.removeAttribute('src');
    try { a.load(); } catch(e) {}
}

window.npTogglePlay = function() {
    haptic(8);
    const a = nativeAudioEl();
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
};

window.npSkip = function(sec) {
    haptic(5);
    const a = nativeAudioEl();
    if (!a || !isFinite(a.duration)) return;
    a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + sec));
};

// ── Wake Lock API Helper ───────────────────────────────────────────────────
async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
        if (!wakeLock) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('🔊 Wake lock active (Audio playback active)');
        }
    } catch (err) {
        console.warn('⚠️ Wake lock request failed:', err);
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release().then(() => {
            wakeLock = null;
            console.log('🔇 Wake lock released');
        }).catch(() => {});
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        const a = nativeAudioEl();
        if (a && !a.paused && typeof usingNativeAudio !== 'undefined' && usingNativeAudio) {
            await requestWakeLock();
        }
    }
});

(function setupNativeAudioEvents() {
    document.addEventListener('DOMContentLoaded', wire);
    if (document.readyState !== 'loading') wire();
    let wired = false;
    function wire() {
        if (wired) return;
        const a = nativeAudioEl();
        if (!a) return;
        wired = true;
        const seek = document.getElementById('np-seek');
        const cur = document.getElementById('np-cur');
        const dur = document.getElementById('np-dur');
        const playBtn = document.getElementById('np-play-btn');

        a.addEventListener('loadedmetadata', () => { if (dur) dur.textContent = fmtTime(a.duration); });
        a.addEventListener('timeupdate', () => {
            if (cur) cur.textContent = fmtTime(a.currentTime);
            if (seek && isFinite(a.duration) && a.duration > 0) seek.value = (a.currentTime / a.duration) * 100;
            const now = Date.now();
            if (currentPlayerItem && a.currentTime > 5 && now - npLastSave > 5000) {
                npLastSave = now;
                videoProgress[currentPlayerItem.code] = a.currentTime;
                localStorage.setItem('videoProgress', JSON.stringify(videoProgress));
            }
        });
        a.addEventListener('play', () => {
            if (playBtn) playBtn.textContent = '⏸';
            if (navigator.mediaSession) navigator.mediaSession.playbackState = 'playing';
            requestWakeLock();
        });
        a.addEventListener('pause', () => {
            if (playBtn) playBtn.textContent = '▶';
            if (navigator.mediaSession) navigator.mediaSession.playbackState = 'paused';
            releaseWakeLock();
        });
        a.addEventListener('ended', () => {
            releaseWakeLock();
            if (usingNativeAudio) handlePlaybackEnded();
        });
        if (seek) seek.addEventListener('input', () => {
            if (isFinite(a.duration) && a.duration > 0) a.currentTime = (seek.value / 100) * a.duration;
        });
    }
})();

// ══════════════════════════════════════════════════════════
// v2.1 — REPEAT COUNTER (৩×/৭×/১১×/২১× prescribed listens)
// ══════════════════════════════════════════════════════════
let repeatTarget = parseInt(localStorage.getItem('repeatTarget') || '0');
let repeatDone = 0;

window.toggleRepeatPicker = function() {
    haptic(8);
    document.getElementById('repeat-picker')?.classList.toggle('hidden');
};

window.setRepeatTarget = function(n) {
    haptic(10);
    repeatTarget = n;
    repeatDone = 0;
    localStorage.setItem('repeatTarget', String(n));
    document.getElementById('repeat-picker')?.classList.add('hidden');
    renderRepeatProgress();
    showToast(n > 0 ? `🔁 ${toBn(n)} বার রিপিট চালু` : 'রিপিট বন্ধ');
};

function renderRepeatProgress() {
    const btn = document.getElementById('repeat-btn');
    const label = document.getElementById('repeat-label');
    const prog = document.getElementById('repeat-progress');
    if (!btn) return;
    btn.classList.toggle('on', repeatTarget > 0);
    if (label) label.textContent = repeatTarget > 0 ? `${toBn(repeatTarget)}×` : 'রিপিট';
    if (prog) prog.textContent = repeatTarget > 0 ? `${toBn(repeatDone)}/${toBn(repeatTarget)} সম্পন্ন` : '';
}

document.addEventListener('click', (e) => {
    const picker = document.getElementById('repeat-picker');
    const btn = document.getElementById('repeat-btn');
    if (picker && btn && !picker.contains(e.target) && !btn.contains(e.target)) picker.classList.add('hidden');
});

// ══════════════════════════════════════════════════════════
// v2.1 — PLAYBACK SPEED
// ══════════════════════════════════════════════════════════
let playbackSpeed = parseFloat(localStorage.getItem('playbackSpeed') || '1');
const SPEEDS = [0.75, 1, 1.25, 1.5];

window.cycleSpeed = function() {
    haptic(8);
    const idx = SPEEDS.indexOf(playbackSpeed);
    playbackSpeed = SPEEDS[(idx + 1) % SPEEDS.length];
    localStorage.setItem('playbackSpeed', String(playbackSpeed));
    const a = nativeAudioEl();
    if (a) a.playbackRate = playbackSpeed;
    try { ytPlayer?.setPlaybackRate?.(playbackSpeed); } catch(e) {}
    updateSpeedLabel();
    showToast(`⚡ গতি: ${playbackSpeed}x`);
};

function updateSpeedLabel() {
    const label = document.getElementById('speed-label');
    const btn = document.getElementById('speed-btn');
    if (label) label.textContent = `${playbackSpeed}x`;
    if (btn) btn.classList.toggle('on', playbackSpeed !== 1);
}

// ══════════════════════════════════════════════════════════
// v2.1 — OFFLINE DOWNLOADS (MP3 tracks only — Cache API)
// ══════════════════════════════════════════════════════════
const AUDIO_CACHE = 'ruqyah-audio-dl-v1';
let downloadedAudio = JSON.parse(localStorage.getItem('downloadedAudio') || '[]');
let dlInProgress = false;

// Anything with a hosted file can be saved; the YouTube-only tracks can't.
const isDownloadable = (item) => !!(item?.audio) && 'caches' in window;
const downloadableTracks = () => audioData.filter(isDownloadable);

function fmtBytes(n) {
    if (!n) return '—';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n < 10 && i > 1 ? n.toFixed(1) : Math.round(n)}${u[i]}`;
}

// Saves one track. Shared by the player button and the bulk queue so there is a
// single definition of "downloaded": bytes in the cache AND the code in the
// list — a half-finished fetch must not leave the code behind claiming offline.
async function cacheTrack(item) {
    const cache = await caches.open(AUDIO_CACHE);
    const res = await fetch(item.audio, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await cache.put(item.audio, res);
    if (!downloadedAudio.includes(item.code)) {
        downloadedAudio.push(item.code);
        localStorage.setItem('downloadedAudio', JSON.stringify(downloadedAudio));
    }
}

function updateDownloadBtn(item) {
    const btn = document.getElementById('download-btn');
    const label = document.getElementById('download-label');
    if (!btn) return;
    if (!item?.audio || !('caches' in window)) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    const has = downloadedAudio.includes(item.code);
    btn.classList.toggle('on', has);
    if (label) label.textContent = has ? 'সেভ আছে ✓' : 'ডাউনলোড';
}

window.downloadCurrentAudio = async function() {
    haptic(10);
    const item = currentPlayerItem;
    if (!item?.audio) return;
    if (downloadedAudio.includes(item.code)) {
        if (confirm('অফলাইন কপি মুছে ফেলবেন?')) {
            await removeDownload(item.code);
            showToast('ডাউনলোড মুছে ফেলা হয়েছে');
        }
        updateDownloadBtn(item);
        return;
    }
    if (dlInProgress) { showToast('একটি ডাউনলোড চলছে...'); return; }
    dlInProgress = true;
    const label = document.getElementById('download-label');
    if (label) label.textContent = 'ডাউনলোড হচ্ছে...';
    try {
        await cacheTrack(item);
        showToast('✅ অফলাইনে সেভ হয়েছে — ইন্টারনেট ছাড়াও শুনতে পারবেন');
    } catch(e) {
        showToast('⚠️ ডাউনলোড ব্যর্থ — ইন্টারনেট চেক করুন');
    }
    dlInProgress = false;
    updateDownloadBtn(item);
    renderAudio();
};

// ── Bulk download ────────────────────────────────────────
// 278 tracks is far too many to save one player screen at a time, so the
// Downloads modal can queue a whole category — or everything — and work through
// it. Serial, not parallel: a phone on mobile data chokes on eight concurrent
// multi-MB fetches, and one at a time keeps the progress line honest.
let bulkState = null;   // { queue, done, failed, cancel, total }

window.startBulkDownload = async function(category) {
    if (bulkState) { showToast('ডাউনলোড চলছে…'); return; }
    haptic(10);

    const pool = downloadableTracks().filter(t => category === 'all' || t.category === category);
    const queue = pool.filter(t => !downloadedAudio.includes(t.code));
    if (!pool.length) { showToast('এই ক্যাটাগরিতে ডাউনলোডযোগ্য অডিও নেই'); return; }
    if (!queue.length) { showToast('✓ এগুলো আগেই সেভ করা আছে'); return; }

    // Browsers evict the cache silently when the disk gets tight, which would
    // quietly delete a 3GB download the user waited an hour for. Asking for
    // persistent storage makes the browser keep it unless the user clears it.
    try { await navigator.storage?.persist?.(); } catch (e) {}

    const est = await estimateSize(queue);
    const label = category === 'all' ? 'সব অডিও' : category;
    if (!confirm(`${label} — ${toBn(queue.length)}টি ট্র্যাক ডাউনলোড হবে`
        + (est ? `\nআনুমানিক সাইজ: ${fmtBytes(est)}` : '')
        + `\n\nWi-Fi-তে থাকলে ভালো। চালিয়ে যাবেন?`)) return;

    bulkState = { queue, done: 0, failed: [], cancel: false, total: queue.length };
    renderDownloads();

    for (const item of queue) {
        if (bulkState.cancel) break;
        try {
            await cacheTrack(item);
        } catch (e) {
            bulkState.failed.push(item.code);
        }
        bulkState.done++;
        renderDownloads();
    }

    const { done, failed, cancel } = bulkState;
    bulkState = null;
    renderDownloads();
    renderAudio();
    if (cancel)            showToast(`থামানো হয়েছে — ${toBn(done)}টি সেভ হয়েছে`);
    else if (failed.length) showToast(`✅ ${toBn(done - failed.length)}টি সেভ · ⚠️ ${toBn(failed.length)}টি ব্যর্থ`);
    else                    showToast(`✅ ${toBn(done)}টি ট্র্যাক অফলাইনে সেভ হয়েছে`);
};

window.cancelBulkDownload = function() {
    if (bulkState) { bulkState.cancel = true; showToast('চলতি ফাইলটি শেষ করে থামবে…'); }
};

// HEAD each file for its Content-Length. Servers that don't answer HEAD (or
// don't expose the header cross-origin) just give a smaller sample; a few
// tracks are enough to scale up an estimate, and no estimate is better than a
// wrong one, so a total failure returns null and the prompt drops the line.
async function estimateSize(items) {
    const sample = items.slice(0, 4);
    let bytes = 0, ok = 0;
    await Promise.all(sample.map(async (t) => {
        try {
            const r = await fetch(t.audio, { method: 'HEAD', mode: 'cors' });
            const len = parseInt(r.headers.get('content-length') || '0', 10);
            if (len) { bytes += len; ok++; }
        } catch (e) {}
    }));
    return ok ? Math.round((bytes / ok) * items.length) : null;
}

async function removeDownload(code) {
    const item = audioData.find(a => a.code === code);
    if (item?.audio && 'caches' in window) {
        try {
            const cache = await caches.open(AUDIO_CACHE);
            await cache.delete(item.audio);
        } catch(e) {}
    }
    downloadedAudio = downloadedAudio.filter(c => c !== code);
    localStorage.setItem('downloadedAudio', JSON.stringify(downloadedAudio));
}

window.openDownloadsModal = function() {
    haptic(10);
    renderDownloads();
    document.getElementById('downloads-modal')?.classList.remove('hidden');
};
window.closeDownloadsModal = function() { document.getElementById('downloads-modal')?.classList.add('hidden'); };

function renderDownloads() {
    const el = document.getElementById('downloads-content');
    if (!el) return;
    const items = downloadedAudio.map(c => audioData.find(a => a.code === c)).filter(Boolean);
    const pool = downloadableTracks();
    const left = pool.filter(t => !downloadedAudio.includes(t.code)).length;

    // Per-category rows, so someone who only wants জাদু doesn't pull 4GB.
    const cats = [...new Set(pool.map(t => t.category))].map(c => {
        const all = pool.filter(t => t.category === c);
        return { c, total: all.length, have: all.filter(t => downloadedAudio.includes(t.code)).length };
    }).sort((a, b) => b.total - a.total);

    const b = bulkState;
    const bulkUI = b ? `
        <div class="dl-bulk">
            <p class="dl-bulk-title">⬇ ডাউনলোড হচ্ছে… ${toBn(b.done)}/${toBn(b.total)}</p>
            <div class="dl-bar"><span style="width:${Math.round(b.done / b.total * 100)}%"></span></div>
            ${b.failed.length ? `<p class="dl-note" style="color:#ff6b6b">${toBn(b.failed.length)}টি ব্যর্থ হয়েছে</p>` : ''}
            <button onclick="cancelBulkDownload()" class="dl-cancel-btn">থামান</button>
        </div>`
    : pool.length ? `
        <div class="dl-bulk">
            <p class="dl-bulk-title">${toBn(items.length)}/${toBn(pool.length)} ট্র্যাক অফলাইনে আছে</p>
            <div class="dl-bar"><span style="width:${pool.length ? Math.round(items.length / pool.length * 100) : 0}%"></span></div>
            ${left ? `<button onclick="startBulkDownload('all')" class="dl-all-btn">⬇ বাকি ${toBn(left)}টি সব ডাউনলোড করুন</button>
                      <p class="dl-note">বড় ডাউনলোড — Wi-Fi-তে করুন। চাইলে ক্যাটাগরি ধরে ধরেও নামাতে পারেন:</p>
                      <div class="dl-cats">${cats.map(x => `
                          <button onclick="startBulkDownload(decodeURIComponent('${encodeURIComponent(x.c)}'))"
                                  class="dl-cat-btn ${x.have === x.total ? 'done' : ''}"
                                  ${x.have === x.total ? 'disabled' : ''}>
                              ${x.c} <span>${toBn(x.have)}/${toBn(x.total)}</span>
                          </button>`).join('')}</div>`
                   : '<p class="dl-note" style="color:var(--green)">✓ সব অডিও অফলাইনে সেভ করা আছে</p>'}
        </div>` : '';

    el.innerHTML = `
        <p class="modal-title">💾 অফলাইন ডাউনলোড</p>
        ${bulkUI}
        ${items.length === 0 ? `
            <div style="text-align:center;padding:24px 8px">
                <p style="font-size:2rem;margin-bottom:10px">📥</p>
                <p style="font-size:0.85rem;color:var(--text-sub);margin-bottom:6px">এখনো কিছু ডাউনলোড করা হয়নি</p>
                <p style="font-size:0.75rem;color:var(--text-dim)">${pool.length
                    ? 'উপরের বাটন দিয়ে সব একসাথে, বা যেকোনো অডিও কার্ডের ⬇ বাটন দিয়ে একটা একটা করে সেভ করুন'
                    : 'এই অডিওগুলো এখনো শুধু YouTube-এ আছে — অফলাইন ফাইল যুক্ত হলে এখানে ডাউনলোড বাটন দেখা যাবে'}</p>
            </div>` :
        items.map(item => `
            <div class="recent-item">
                <div class="recent-icon" onclick="closeDownloadsModal();openPlayer('${item.code}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
                <div class="mn-0" style="flex:1" onclick="closeDownloadsModal();openPlayer('${item.code}')">
                    <p class="recent-title clamp1">${item.title_bn}</p>
                    <p class="recent-meta">${item.code} · ${item.category} · <span style="color:var(--green)">✓ অফলাইন</span></p>
                </div>
                <button onclick="removeDownloadAndRefresh('${item.code}')" style="width:32px;height:32px;border-radius:var(--r-md);background:none;border:1px solid rgba(255,100,100,0.2);color:#ff6b6b;cursor:pointer;flex-shrink:0">✕</button>
            </div>`).join('')}
    `;
}

// The ⬇ on an audio card — save, or tap again to free the space.
window.toggleTrackDownload = async function(code) {
    haptic(10);
    const item = audioData.find(a => a.code === code);
    if (!isDownloadable(item)) return;

    if (downloadedAudio.includes(code)) {
        if (!confirm(`"${item.title_bn}" এর অফলাইন কপি মুছে ফেলবেন?`)) return;
        await removeDownload(code);
        showToast('মুছে ফেলা হয়েছে');
    } else {
        if (dlInProgress || bulkState) { showToast('একটি ডাউনলোড চলছে...'); return; }
        dlInProgress = true;
        showToast('⬇ ডাউনলোড হচ্ছে…');
        try {
            await cacheTrack(item);
            showToast('✅ অফলাইনে সেভ হয়েছে');
        } catch (e) {
            showToast('⚠️ ডাউনলোড ব্যর্থ — ইন্টারনেট চেক করুন');
        }
        dlInProgress = false;
    }
    renderAudio();
    if (currentPlayerItem?.code === code) updateDownloadBtn(item);
};

window.removeDownloadAndRefresh = async function(code) {
    haptic(10);
    await removeDownload(code);
    renderDownloads();
    showToast('মুছে ফেলা হয়েছে');
};

// ══════════════════════════════════════════════════════════
// v2.1 — SHARE CARD (canvas image → Web Share / download)
// ══════════════════════════════════════════════════════════
function cardRoundRect(x, px, py, w, h, r) {
    x.beginPath();
    x.moveTo(px + r, py);
    x.arcTo(px + w, py, px + w, py + h, r);
    x.arcTo(px + w, py + h, px, py + h, r);
    x.arcTo(px, py + h, px, py, r);
    x.arcTo(px, py, px + w, py, r);
    x.closePath();
}

function cardWrapText(x, text, cx, startY, maxW, lineH, maxLines) {
    const words = text.split(' ');
    let line = '', y = startY, lines = 0;
    for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (x.measureText(test).width > maxW && line) {
            lines++;
            if (lines >= maxLines) { x.fillText(line + '…', cx, y); return y; }
            x.fillText(line, cx, y);
            line = w;
            y += lineH;
        } else line = test;
    }
    if (line) x.fillText(line, cx, y);
    return y;
}

window.shareCardFromPlayer = function() {
    if (currentPlayerItem) shareCard(currentPlayerItem.code);
};

window.shareCard = async function(code) {
    haptic(10);
    const item = audioData.find(a => a.code === code);
    if (!item) return;
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1080;
    const x = c.getContext('2d');

    const g = x.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, '#071510'); g.addColorStop(1, '#0d2b1e');
    x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);

    x.strokeStyle = 'rgba(0,229,153,0.12)'; x.lineWidth = 3;
    x.beginPath(); x.arc(540, 540, 430, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.arc(540, 540, 480, 0, Math.PI * 2); x.stroke();

    x.textAlign = 'center';
    x.fillStyle = '#00e599';
    x.font = '700 42px "Hind Siliguri", sans-serif';
    x.fillText('🌿 Al Quranic Ruqyah Healing', 540, 170);

    x.fillStyle = 'rgba(0,229,153,0.15)';
    cardRoundRect(x, 455, 230, 170, 64, 32); x.fill();
    x.fillStyle = '#00e599'; x.font = '800 36px sans-serif';
    x.fillText(item.code, 540, 274);

    x.fillStyle = '#ffffff'; x.font = '700 56px "Hind Siliguri", sans-serif';
    const endY = cardWrapText(x, item.title_bn, 540, 420, 860, 80, 4);

    x.fillStyle = 'rgba(255,255,255,0.65)'; x.font = '600 38px "Hind Siliguri", sans-serif';
    x.fillText(`${categoryIcons[item.category] || ''} ${item.category}`, 540, Math.max(endY + 110, 780));

    x.fillStyle = 'rgba(255,255,255,0.5)'; x.font = '500 30px sans-serif';
    x.fillText('al-quranic-ruqyah-healing.vercel.app', 540, 970);

    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) { showToast('কার্ড তৈরি করা যায়নি'); return; }
    const file = new File([blob], `ruqyah-${item.code}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: item.title_bn, text: `${item.title_bn}\n${item.url}` });
            return;
        } catch(e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('🖼 কার্ড সেভ হয়েছে — WhatsApp-এ শেয়ার করুন');
};

// ══════════════════════════════════════════════════════════
// v2.1 — SYMPTOM CHECKER (লক্ষণ যাচাই)
// ══════════════════════════════════════════════════════════
const SYMPTOM_GROUPS = [
    { title: '🏥 শারীরিক লক্ষণ', items: [
        { t: 'শরীরের বিভিন্ন জায়গায় ব্যথা ঘুরে বেড়ায়, টেস্টে কিছু ধরা পড়ে না', w: { sihr: 2, jinn: 1 } },
        { t: 'মাথাব্যথা লেগেই থাকে, ওষুধে তেমন কমে না', w: { nazar: 2, sihr: 1 } },
        { t: 'সবসময় ক্লান্তি, অলসতা ও শরীর ভারী লাগে', w: { nazar: 2, hasad: 1 } },
        { t: 'বুক ধড়ফড় বা শ্বাস আটকে আসার অনুভূতি হয়', w: { jinn: 1, sihr: 1 } },
        { t: 'হঠাৎ শরীর গরম/ঠান্ডা হয়ে যায় বা কাঁপুনি আসে', w: { jinn: 2 } },
    ]},
    { title: '🌙 ঘুম ও স্বপ্ন', items: [
        { t: 'ঘুমের মধ্যে বোবায় ধরে (চাপ অনুভব, নড়তে পারি না)', w: { jinn: 2, sihr: 1 } },
        { t: 'সাপ, কুকুর, বিড়াল বা মৃত মানুষ স্বপ্নে দেখি', w: { sihr: 2, jinn: 1 } },
        { t: 'উঁচু থেকে পড়ে যাওয়া বা কেউ তাড়া করার স্বপ্ন দেখি', w: { jinn: 1, nazar: 1 } },
        { t: 'ঘুম আসে না বা রাতে বারবার ভেঙে যায়', w: { nazar: 1, jinn: 1 } },
        { t: 'স্বপ্নে কেউ শারীরিক সম্পর্কের চেষ্টা করে', w: { jinn: 3 } },
    ]},
    { title: '🧠 মানসিক ও আচরণগত', items: [
        { t: 'নামাজ-কুরআনে প্রবল অনীহা বা ভেতর থেকে বাধা অনুভব করি', w: { sihr: 2, jinn: 2 } },
        { t: 'কুরআন তিলাওয়াত বা আযান শুনলে অস্বস্তি, রাগ বা মাথা ভার হয়', w: { jinn: 3, sihr: 2 } },
        { t: 'হঠাৎ প্রচণ্ড রাগ বা কান্না আসে, নিজেকে নিয়ন্ত্রণ করতে পারি না', w: { jinn: 2, sihr: 1 } },
        { t: 'স্বামী/স্ত্রীর প্রতি অকারণে ঘৃণা বা দূরত্ব তৈরি হয়েছে', w: { sihr: 3 } },
        { t: 'একা থাকতে ইচ্ছা করে, মানুষ থেকে দূরে সরে যাচ্ছি', w: { jinn: 1, hasad: 1 } },
    ]},
    { title: '💼 অন্যান্য', items: [
        { t: 'কাজ, ব্যবসা বা বিয়ের প্রস্তাব বারবার শেষ মুহূর্তে আটকে যায়', w: { sihr: 2, hasad: 2 } },
        { t: 'কারো প্রশংসা পাওয়ার পর হঠাৎ অসুস্থতা বা সমস্যা শুরু হয়েছে', w: { nazar: 3, hasad: 1 } },
        { t: 'পরিবারে অকারণে ঝগড়া-অশান্তি লেগে থাকে', w: { sihr: 2, hasad: 1 } },
        { t: 'মনে হয় কেউ আমাকে হিংসা করে বা ক্ষতি চায়', w: { hasad: 2, nazar: 1 } },
    ]},
];

const CONDITIONS = {
    nazar: { label: 'বদনজর', icon: '🧿', cat: 'বদনজর' },
    sihr:  { label: 'জাদু/সিহর', icon: '🪄', cat: 'জাদু' },
    jinn:  { label: 'জ্বিনের সমস্যা', icon: '🔥', cat: 'জ্বিন' },
    hasad: { label: 'হাসাদ (হিংসা)', icon: '👁️', cat: 'বদনজর' },
};

let symptomSelected = new Set();

window.openSymptomChecker = function() {
    haptic(10);
    symptomSelected = new Set();
    renderSymptomForm();
    document.getElementById('symptom-modal')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};
window.closeSymptomChecker = function() {
    document.getElementById('symptom-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
};

function renderSymptomForm() {
    const el = document.getElementById('symptom-content');
    if (!el) return;
    let idx = 0;
    el.innerHTML = `
        <p class="modal-title">🩺 লক্ষণ যাচাই</p>
        <p style="font-size:0.8rem;color:var(--text-sub);margin-bottom:16px">যে লক্ষণগুলো আপনার সাথে মিলে যায় সেগুলোতে টিক দিন — শেষে ফলাফল ও করণীয় দেখুন</p>
        ${SYMPTOM_GROUPS.map(g => `
            <p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim);margin:14px 0 8px">${g.title}</p>
            ${g.items.map(item => {
                const i = idx++;
                return `<div class="symptom-row" id="sym-${i}" onclick="toggleSymptom(${i})">
                    <span class="task-check" id="sym-check-${i}"></span>
                    <span style="flex:1">${item.t}</span>
                </div>`;
            }).join('')}
        `).join('')}
        <button onclick="showSymptomResult()" class="btn-primary w-full" style="margin-top:16px;padding:13px">ফলাফল দেখুন →</button>
        <p style="font-size:0.68rem;color:var(--text-dim);text-align:center;margin-top:10px">⚠️ এটি প্রাথমিক ধারণা মাত্র — চূড়ান্ত মূল্যায়নের জন্য অভিজ্ঞ রাকীর পরামর্শ নিন</p>
    `;
}

window.toggleSymptom = function(i) {
    haptic(5);
    if (symptomSelected.has(i)) symptomSelected.delete(i); else symptomSelected.add(i);
    document.getElementById(`sym-${i}`)?.classList.toggle('sel', symptomSelected.has(i));
    const check = document.getElementById(`sym-check-${i}`);
    if (check) check.textContent = symptomSelected.has(i) ? '✓' : '';
};

window.showSymptomResult = function() {
    haptic(15);
    const allItems = SYMPTOM_GROUPS.flatMap(g => g.items);
    const scores = { nazar: 0, sihr: 0, jinn: 0, hasad: 0 };
    const maxScores = { nazar: 0, sihr: 0, jinn: 0, hasad: 0 };
    allItems.forEach((item, i) => {
        Object.entries(item.w).forEach(([k, v]) => {
            maxScores[k] += v;
            if (symptomSelected.has(i)) scores[k] += v;
        });
    });

    const el = document.getElementById('symptom-content');
    if (!el) return;

    if (symptomSelected.size === 0) {
        showToast('অন্তত একটি লক্ষণ বেছে নিন');
        return;
    }

    const ranked = Object.entries(scores)
        .map(([k, v]) => ({ key: k, pct: Math.round((v / maxScores[k]) * 100), score: v }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.pct - a.pct);

    const result = { date: todayStr(), selected: symptomSelected.size, ranked };
    localStorage.setItem('symptomResult', JSON.stringify(result));
    saveToCloud('symptomResult', result);

    const low = ranked.length === 0 || ranked[0].pct < 25;

    el.innerHTML = `
        <p class="modal-title">🩺 যাচাইয়ের ফলাফল</p>
        ${low ? `
            <div style="background:var(--green-dim);border:1px solid rgba(0,229,153,0.25);border-radius:var(--r-md);padding:14px;margin-bottom:14px">
                <p style="font-weight:700;margin-bottom:4px">✅ আলহামদুলিল্লাহ</p>
                <p style="font-size:0.8rem;color:var(--text-sub)">উল্লেখযোগ্য কোনো লক্ষণের ধরন পাওয়া যায়নি। নিয়মিত সকাল-সন্ধ্যার আযকার ও সুরক্ষার রুকিয়াহ চালিয়ে যান।</p>
            </div>` : `
            <p style="font-size:0.8rem;color:var(--text-sub);margin-bottom:14px">${toBn(symptomSelected.size)}টি লক্ষণের ভিত্তিতে সম্ভাব্য ধরন:</p>
            ${ranked.slice(0, 3).map(r => {
                const c = CONDITIONS[r.key];
                return `<div style="margin-bottom:12px">
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px">
                        <span style="font-size:0.85rem;font-weight:700">${c.icon} ${c.label}</span>
                        <span style="font-size:0.8rem;font-weight:800;color:var(--green)">${toBn(r.pct)}%</span>
                    </div>
                    <div class="cond-bar-track"><div class="cond-bar-fill" style="width:${r.pct}%"></div></div>
                </div>`;
            }).join('')}
        `}
        ${!low && ranked[0] ? (() => {
            const topCat = CONDITIONS[ranked[0].key].cat;
            const recs = audioData.filter(a => a.category === topCat).slice(0, 4);
            return recs.length ? `
                <p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim);margin:16px 0 8px">প্রস্তাবিত রুকিয়াহ অডিও</p>
                ${recs.map(item => `
                    <div class="recent-item" onclick="closeSymptomChecker();openPlayer('${item.code}')">
                        <div class="recent-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
                        <div class="mn-0" style="flex:1">
                            <p class="recent-title clamp1">${item.title_bn}</p>
                            <p class="recent-meta">${item.code} · ${item.category}</p>
                        </div>
                    </div>`).join('')}
            ` : '';
        })() : ''}
        <div style="display:flex;gap:8px;margin-top:16px">
            <button onclick="closeSymptomChecker();openProgramModal()" class="btn-ghost" style="flex:1;padding:11px;font-size:0.8rem">📅 ৭ দিনের প্রোগ্রাম</button>
            <button onclick="closeSymptomChecker();openPatientForm()" class="btn-primary" style="flex:1;padding:11px;font-size:0.8rem">📋 রাকীর পরামর্শ নিন</button>
        </div>
        <button onclick="openSymptomChecker()" style="width:100%;margin-top:10px;padding:9px;border-radius:var(--r-md);background:none;border:1px solid var(--border);color:var(--text-sub);font-weight:600;font-size:0.78rem;cursor:pointer;font-family:inherit">↺ আবার যাচাই করুন</button>
        <p style="font-size:0.68rem;color:var(--text-dim);text-align:center;margin-top:12px">⚠️ এটি চূড়ান্ত রোগনির্ণয় নয়। রুকিয়াহ মেডিকেল চিকিৎসার বিকল্প নয় — প্রয়োজনে ডাক্তার দেখান।</p>
    `;
};

// ══════════════════════════════════════════════════════════
// v2.1 — 7-DAY GUIDED RUQYAH PROGRAM
// ══════════════════════════════════════════════════════════
const PROGRAM7 = [
    { title: 'সূচনা ও সুরক্ষা', cat: 'সুরক্ষা', focus: 'তওবা-ইস্তিগফার দিয়ে শুরু করুন এবং সুরক্ষার আমল গড়ে তুলুন' },
    { title: 'বদনজর থেকে মুক্তি', cat: 'বদনজর', focus: 'বদনজর ও হাসাদের রুকিয়াহ মনোযোগ দিয়ে শুনুন' },
    { title: 'জাদু নষ্টের রুকিয়াহ', cat: 'জাদু', focus: 'জাদু ধ্বংসের আয়াতগুলো বিশ্বাসের সাথে শুনুন' },
    { title: 'জ্বিন থেকে সুরক্ষা', cat: 'জ্বিন', focus: 'আয়াতুল কুরসি ও জ্বিন সংক্রান্ত রুকিয়াহ' },
    { title: 'শিফা ও সুস্থতা', cat: 'অসুখ', focus: 'শিফার আয়াত ও দুআ — আল্লাহর কাছে সুস্থতা চান' },
    { title: 'দৈনিক আমল গঠন', cat: 'আমল', focus: 'সকাল-সন্ধ্যার আযকার অভ্যাসে পরিণত করুন' },
    { title: 'সমাপ্তি ও মূল্যায়ন', cat: 'সুরক্ষা', focus: 'অগ্রগতি মূল্যায়ন করুন এবং নিয়মিত রুটিন ঠিক করুন' },
];

const PROGRAM_DAILY_TASKS = [
    { id: 'azkar_m', label: '🌅 সকালের আযকার পড়া', type: 'amal' },
    { id: 'audio',   label: '🎧 আজকের রুকিয়াহ অডিও শোনা', type: 'audio' },
    { id: 'azkar_e', label: '🌇 সন্ধ্যার আযকার পড়া', type: 'amal' },
    { id: 'istighfar', label: '📿 ইস্তিগফার ১০০ বার', type: 'tasbeeh' },
    { id: 'salah',   label: '🤲 ২ রাকাত নফল + নিজের জন্য দুআ', type: 'amal' },
];

let program7State = JSON.parse(localStorage.getItem('program7') || '{"startDate":"","done":{}}');

function saveProgram7() {
    localStorage.setItem('program7', JSON.stringify(program7State));
    saveToCloud('program7', program7State);
}

function programCurrentDay() {
    if (!program7State.startDate) return 0;
    const start = new Date(program7State.startDate + 'T00:00:00');
    const diff = Math.floor((new Date() - start) / 86400000);
    return Math.min(7, Math.max(1, diff + 1));
}

function programDayDone(dayNum) {
    return PROGRAM_DAILY_TASKS.every(t => program7State.done[`d${dayNum}_${t.id}`]);
}

window.openProgramModal = function(day) {
    haptic(10);
    renderProgram(day);
    document.getElementById('program-modal')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};
window.closeProgramModal = function() {
    document.getElementById('program-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
};

window.startProgram7 = function() {
    haptic(20);
    program7State = { startDate: todayStr(), done: {} };
    saveProgram7();
    renderProgram(1);
    showToast('🌿 ৭ দিনের প্রোগ্রাম শুরু হলো — আল্লাহ সহজ করুন');
};

window.resetProgram7 = function() {
    if (!confirm('প্রোগ্রাম রিসেট করবেন? সব অগ্রগতি মুছে যাবে।')) return;
    program7State = { startDate: '', done: {} };
    saveProgram7();
    renderProgram();
};

function renderProgram(viewDay) {
    const el = document.getElementById('program-content');
    if (!el) return;

    if (!program7State.startDate) {
        el.innerHTML = `
            <p class="modal-title">📅 ৭ দিনের রুকিয়াহ প্রোগ্রাম</p>
            <p style="font-size:0.85rem;color:var(--text-sub);margin-bottom:16px;line-height:1.6">প্রতিদিন ৫টি সহজ কাজ — রুকিয়াহ অডিও, আযকার, ইস্তিগফার ও দুআ। ৭ দিনে একটি পূর্ণাঙ্গ সেলফ-রুকিয়াহ রুটিন গড়ে উঠবে ইনশাআল্লাহ।</p>
            ${PROGRAM7.map((d, i) => `
                <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
                    <span style="width:28px;height:28px;border-radius:50%;background:var(--green-dim);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800;flex-shrink:0">${toBn(i+1)}</span>
                    <div>
                        <p style="font-size:0.83rem;font-weight:700">${d.title}</p>
                        <p style="font-size:0.7rem;color:var(--text-dim)">${d.focus}</p>
                    </div>
                </div>`).join('')}
            <button onclick="startProgram7()" class="btn-primary w-full" style="margin-top:18px;padding:13px">🌿 আজ থেকে শুরু করুন</button>
        `;
        return;
    }

    const currentDay = programCurrentDay();
    const day = Math.min(viewDay || currentDay, 7);
    const dayInfo = PROGRAM7[day - 1];
    const totalTasks = 7 * PROGRAM_DAILY_TASKS.length;
    const doneTasks = Object.values(program7State.done).filter(Boolean).length;
    const pct = Math.round((doneTasks / totalTasks) * 100);
    const allComplete = [1,2,3,4,5,6,7].every(programDayDone);
    const locked = day > currentDay;

    const catAudios = audioData.filter(a => a.category === dayInfo.cat);
    const dayAudio = catAudios.length ? catAudios[(day - 1) % catAudios.length] : null;

    el.innerHTML = `
        <p class="modal-title">📅 ৭ দিনের রুকিয়াহ প্রোগ্রাম</p>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.75rem;color:var(--text-sub)">মোট অগ্রগতি</span>
            <span style="font-size:0.75rem;font-weight:800;color:var(--green)">${toBn(pct)}%</span>
        </div>
        <div class="cond-bar-track" style="margin-bottom:14px"><div class="cond-bar-fill" style="width:${pct}%"></div></div>
        ${allComplete ? `
            <div style="background:var(--green-dim);border:1px solid rgba(0,229,153,0.3);border-radius:var(--r-md);padding:14px;margin-bottom:14px;text-align:center">
                <p style="font-size:1.5rem;margin-bottom:6px">🎉</p>
                <p style="font-weight:800;margin-bottom:4px">মাশাআল্লাহ! প্রোগ্রাম সম্পন্ন!</p>
                <p style="font-size:0.78rem;color:var(--text-sub)">জার্নালে আপনার অবস্থা লিখে রাখুন এবং প্রয়োজনে আবার শুরু করুন।</p>
            </div>` : ''}
        <div class="day-tabs">
            ${[1,2,3,4,5,6,7].map(d => `
                <button class="day-tab${d === day ? ' active' : ''}${programDayDone(d) ? ' complete' : ''}" onclick="renderProgramDay(${d})">
                    ${programDayDone(d) ? '✓ ' : d > currentDay ? '🔒 ' : ''}দিন ${toBn(d)}
                </button>`).join('')}
        </div>
        <p style="font-size:0.9rem;font-weight:800;margin-bottom:2px">${dayInfo.title}</p>
        <p style="font-size:0.75rem;color:var(--text-sub);margin-bottom:12px">${dayInfo.focus}</p>
        ${locked ? `
            <p style="text-align:center;color:var(--text-dim);font-size:0.82rem;padding:20px 0">🔒 এই দিনটি এখনো আসেনি — প্রতিদিন একটি করে দিন খুলবে</p>
        ` : PROGRAM_DAILY_TASKS.map(t => {
            const key = `d${day}_${t.id}`;
            const done = !!program7State.done[key];
            let action = '';
            if (t.type === 'audio' && dayAudio) action = `<button onclick="event.stopPropagation();openPlayer('${dayAudio.code}')" class="btn-play" style="padding:6px 12px;font-size:0.72rem;flex-shrink:0">▶ শুনুন</button>`;
            if (t.type === 'tasbeeh') action = `<button onclick="event.stopPropagation();closeProgramModal();openTasbeeh()" class="btn-play" style="padding:6px 12px;font-size:0.72rem;flex-shrink:0">📿 কাউন্টার</button>`;
            return `<div class="task-row${done ? ' done' : ''}" onclick="toggleProgramTask('${key}',${day})">
                <span class="task-check">${done ? '✓' : ''}</span>
                <span class="task-label">${t.label}${t.type === 'audio' && dayAudio ? `<br><span style="font-size:0.68rem;color:var(--text-dim);font-weight:500">${dayAudio.title_bn}</span>` : ''}</span>
                ${action}
            </div>`;
        }).join('')}
        <button onclick="resetProgram7()" style="width:100%;margin-top:12px;padding:9px;border-radius:var(--r-md);background:none;border:1px solid rgba(255,100,100,0.2);color:#ff6b6b;font-weight:600;font-size:0.76rem;cursor:pointer;font-family:inherit">প্রোগ্রাম রিসেট করুন</button>
    `;
}

window.renderProgramDay = function(d) { haptic(5); renderProgram(d); };

window.toggleProgramTask = function(key, day) {
    haptic(8);
    program7State.done[key] = !program7State.done[key];
    saveProgram7();
    renderProgram(day);
    if (programDayDone(day)) {
        haptic(30);
        showToast(`🎉 দিন ${toBn(day)} সম্পন্ন! মাশাআল্লাহ`);
    }
};

// ══════════════════════════════════════════════════════════
// v2.1 — SYMPTOM JOURNAL (দৈনিক অবস্থা ট্র্যাকিং)
// ══════════════════════════════════════════════════════════
const JOURNAL_METRICS = [
    { id: 'sleep', label: '🌙 ঘুম', hint: 'কেমন ঘুম হয়েছে?' },
    { id: 'body',  label: '💪 শরীর', hint: 'শারীরিক অবস্থা?' },
    { id: 'mind',  label: '🧠 মন', hint: 'মানসিক অবস্থা?' },
    { id: 'ibadah', label: '🤲 ইবাদত', hint: 'ইবাদতে মনোযোগ?' },
];

let journalData = JSON.parse(localStorage.getItem('ruqyahJournal') || '{}');
let journalDraft = {};

window.openJournalModal = function() {
    haptic(10);
    const today = journalData[todayStr()] || {};
    journalDraft = { sleep: today.sleep || 0, body: today.body || 0, mind: today.mind || 0, ibadah: today.ibadah || 0, note: today.note || '' };
    renderJournal();
    document.getElementById('journal-modal')?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};
window.closeJournalModal = function() {
    document.getElementById('journal-modal')?.classList.add('hidden');
    document.body.style.overflow = 'auto';
};

function renderJournal() {
    const el = document.getElementById('journal-content');
    if (!el) return;
    const dates = Object.keys(journalData).sort().reverse().slice(0, 7);
    el.innerHTML = `
        <p class="modal-title">📔 রুকিয়াহ জার্নাল</p>
        <p style="font-size:0.78rem;color:var(--text-sub);margin-bottom:14px">আজকের অবস্থা লিখে রাখুন (১ = খারাপ, ৫ = ভালো) — সময়ের সাথে উন্নতি দেখতে পাবেন</p>
        ${JOURNAL_METRICS.map(m => `
            <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                    <span style="font-size:0.82rem;font-weight:700">${m.label}</span>
                    <span style="font-size:0.7rem;color:var(--text-dim)">${m.hint}</span>
                </div>
                <div class="scale-row">
                    ${[1,2,3,4,5].map(v => `<button class="scale-btn${journalDraft[m.id] === v ? ' sel' : ''}" onclick="setJournalScale('${m.id}',${v})">${toBn(v)}</button>`).join('')}
                </div>
            </div>`).join('')}
        <textarea id="journal-note" class="form-input form-textarea" style="min-height:70px;margin-bottom:12px" placeholder="আজ বিশেষ কিছু অনুভব করেছেন? (স্বপ্ন, প্রতিক্রিয়া, উন্নতি...)">${journalDraft.note || ''}</textarea>
        <button onclick="saveJournalEntry()" class="btn-primary w-full" style="padding:12px;margin-bottom:8px">💾 আজকের এন্ট্রি সেভ করুন</button>
        ${dates.length ? `
            <button onclick="exportJournalWA()" class="btn-ghost w-full" style="padding:11px;margin-bottom:14px">💬 রাকীকে রিপোর্ট পাঠান (WhatsApp)</button>
            <p style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-dim);margin-bottom:8px">গত ${toBn(dates.length)} দিনের এন্ট্রি</p>
            ${dates.map(d => {
                const e = journalData[d];
                const avg = ((e.sleep + e.body + e.mind + e.ibadah) / 4).toFixed(1);
                return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-md);background:var(--raised);border:1px solid var(--border);margin-bottom:6px">
                    <div style="flex:1">
                        <p style="font-size:0.78rem;font-weight:700">${d}</p>
                        ${e.note ? `<p class="clamp1" style="font-size:0.7rem;color:var(--text-dim)">${e.note}</p>` : ''}
                    </div>
                    <span style="font-size:0.85rem;font-weight:800;color:${avg >= 3.5 ? 'var(--green)' : avg >= 2.5 ? '#facc15' : '#ff6b6b'}">${toBn(avg)}/৫</span>
                </div>`;
            }).join('')}
        ` : ''}
    `;
}

window.setJournalScale = function(id, v) {
    haptic(5);
    journalDraft[id] = v;
    renderJournal();
};

window.saveJournalEntry = function() {
    haptic(15);
    if (!journalDraft.sleep || !journalDraft.body || !journalDraft.mind || !journalDraft.ibadah) {
        showToast('⚠️ চারটি বিষয়েই স্কোর দিন');
        return;
    }
    journalDraft.note = document.getElementById('journal-note')?.value?.trim() || '';
    journalData[todayStr()] = { ...journalDraft };
    localStorage.setItem('ruqyahJournal', JSON.stringify(journalData));
    saveToCloud('journal', journalData);
    renderJournal();
    showToast('✅ জার্নালে সেভ হয়েছে');
};

window.exportJournalWA = function() {
    haptic(10);
    const dates = Object.keys(journalData).sort().reverse().slice(0, 7).reverse();
    if (!dates.length) return;
    const lines = dates.map(d => {
        const e = journalData[d];
        return `📅 ${d}\n  ঘুম: ${e.sleep}/৫ | শরীর: ${e.body}/৫ | মন: ${e.mind}/৫ | ইবাদত: ${e.ibadah}/৫${e.note ? `\n  📝 ${e.note}` : ''}`;
    });
    const name = userProfile?.name || currentUser?.displayName || '';
    const msg = `📔 *রুকিয়াহ জার্নাল রিপোর্ট*${name ? `\n👤 ${name}` : ''}\n\n${lines.join('\n\n')}\n\n_Al Quranic Ruqyah Healing App থেকে পাঠানো_`;
    openExternal(`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(msg)}`);
};

// ══════════════════════════════════════════════════════════
// FEATURE: AI CHATBOT (Gemini 2.5 Flash Proxy & Custom API Key)
// ══════════════════════════════════════════════════════════
let chatHistory = [
    { role: 'bot', text: 'আসসালামু আলাইকুম! আমি রুকইয়াহ এআই অ্যাসিস্ট্যান্ট। কুরআন ও সুন্নাহভিত্তিক রুকইয়াহ, সুরক্ষার আমল এবং বদনজর/জাদু সংক্রান্ত বিষয়ে আপনাকে সহযোগিতা করতে পারি। নিচে কিছু সাধারণ জিজ্ঞাসা রয়েছে অথবা আপনার প্রশ্নটি লিখুন:' }
];

window.openChatSettings = function() {
    haptic(8);
    const modal = document.getElementById('chat-settings-modal');
    const input = document.getElementById('custom-gemini-key');
    if (modal) modal.classList.remove('hidden');
    if (input) input.value = localStorage.getItem('gemini_api_key') || '';
};

window.closeChatSettings = function() {
    document.getElementById('chat-settings-modal')?.classList.add('hidden');
};

window.saveChatSettings = function() {
    haptic(10);
    const input = document.getElementById('custom-gemini-key');
    const key = input?.value?.trim() || '';
    if (key) {
        localStorage.setItem('gemini_api_key', key);
        showToast('✅ কাস্টম API Key সেভ হয়েছে');
    } else {
        localStorage.removeItem('gemini_api_key');
        showToast('✅ কাস্টম API Key মুছে ফেলা হয়েছে');
    }
    closeChatSettings();
};

window.clearChatSettings = function() {
    haptic(10);
    localStorage.removeItem('gemini_api_key');
    const input = document.getElementById('custom-gemini-key');
    if (input) input.value = '';
    showToast('🗑️ কাস্টম API Key মুছে ফেলা হয়েছে');
    closeChatSettings();
};

window.sendSuggestion = function(text) {
    haptic(10);
    const input = document.getElementById('chat-input');
    if (input) {
        input.value = text;
        sendChatMessage();
    }
};

window.handleChatKey = function(e) {
    if (e.key === 'Enter') {
        sendChatMessage();
    }
};

window.sendChatMessage = async function() {
    // AI chat is web-only; its markup and nav tab are cut from the APK, so
    // there is no input element to read here anyway.
    if (IS_NATIVE) return;
    const input = document.getElementById('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    haptic(10);

    input.value = '';
    
    // Add User Message to local state and UI
    chatHistory.push({ role: 'user', text });
    renderChatMessages();

    // Show loading indicator
    const loading = document.getElementById('chat-loading');
    if (loading) loading.classList.remove('hidden');

    try {
        const reply = await callGeminiAPI();
        chatHistory.push({ role: 'bot', text: reply });
    } catch(err) {
        chatHistory.push({ 
            role: 'bot', 
            text: `⚠️ ত্রুটি: ${err.message || 'নেটওয়ার্ক সংযোগ পরীক্ষা করুন এবং সেটিংস চেক করুন।'}` 
        });
    }

    if (loading) loading.classList.add('hidden');
    renderChatMessages();
};

function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    // First message is bot greeting, we render suggestions if only greeting is present
    const isFirst = chatHistory.length === 1;

    container.innerHTML = chatHistory.map(msg => `
        <div class="chat-msg ${msg.role}">
            <div class="chat-msg-bubble">${msg.text}</div>
        </div>
    `).join('') + (isFirst ? `
        <div class="chat-suggestions">
            <button class="chat-chip" onclick="sendSuggestion('বদনজরের রুকইয়াহ কিভাবে করব?')">🧿 বদনজরের রুকইয়াহ</button>
            <button class="chat-chip" onclick="sendSuggestion('জাদুর লক্ষণগুলো কী কী?')">🪄 জাদুর লক্ষণ</button>
            <button class="chat-chip" onclick="sendSuggestion('ঘুমের আগে সুরক্ষার আমল কী?')">🛡️ ঘুমের পূর্বের আমল</button>
            <button class="chat-chip" onclick="sendSuggestion('জ্বিনের আছর বোঝার উপায় কী?')">🔥 জ্বিনের আছর</button>
        </div>
    ` : '');

    // Auto scroll to bottom
    setTimeout(() => {
        container.scrollTop = container.scrollHeight;
    }, 50);
}

async function callGeminiAPI() {
    const customKey = localStorage.getItem('gemini_api_key');
    
    // Transform chat history to Gemini structure (user/model roles)
    const contents = chatHistory.map(msg => ({
        role: msg.role === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));

    if (customKey) {
        // Direct client-side call
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${customKey}`;
        const systemInstruction = {
            parts: [{ text: `You are a helpful, spiritual, and compassionate Islamic Ruqyah Healing AI assistant.
Your goal is to guide users in light of the Quran, Sahih Hadith, and teachings of classical and contemporary Islamic scholars.
Guidelines:
1. Ground your answers strictly in orthodox Islamic theology (Ahlus Sunnah).
2. Recommend Sunnah protections (Aytul Kursi, Char Qul, Adhkar, dates, Sidr leaves).
3. Warn against un-Islamic practices (amulets, pirs, wizards).
4. Write in Bengali primarily, or English if queried in English. Make answers readable.
5. REMINDER: Add a brief medical disclaimer at the end that Ruqyah is du'a, not a replacement for medical science.` }]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction,
                contents,
                generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
            })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error?.message || `HTTP error ${res.status}`);
        }

        const data = await res.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!reply) throw new Error('Invalid response structure from Gemini API');
        return reply;
    } else {
        // Proxy call to Vercel serverless function
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `HTTP error ${res.status}`);
        }

        const data = await res.json();
        if (!data.reply) throw new Error(data.error || 'Invalid proxy reply');
        return data.reply;
    }
}

init();
