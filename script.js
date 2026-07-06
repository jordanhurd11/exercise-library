// ── Config ────────────────────────────────────────────────────────
var API_BASE = 'https://wger.de/api/v2';
var EXERCISES_PER_PAGE = 20;
var ENGLISH_LANGUAGE_ID = 2;

// ── State ─────────────────────────────────────────────────────────
var allExercises = [];       // full fetched + processed list
var filteredExercises = [];  // after search/filter
var favorites = [];          // IDs saved to localStorage
var currentPage = 1;

// ── DOM refs ──────────────────────────────────────────────────────
var searchInput     = document.getElementById('searchInput');
var categoryFilter  = document.getElementById('categoryFilter');
var equipmentFilter = document.getElementById('equipmentFilter');
var sortSelect      = document.getElementById('sortSelect');
var resetBtn        = document.getElementById('resetBtn');
var retryBtn        = document.getElementById('retryBtn');

var loadingState  = document.getElementById('loadingState');
var errorState    = document.getElementById('errorState');
var emptyState    = document.getElementById('emptyState');
var exerciseGrid  = document.getElementById('exerciseGrid');
var pagination    = document.getElementById('pagination');
var resultsCount  = document.getElementById('resultsCount');
var pageInfo      = document.getElementById('pageInfo');
var prevPageBtn   = document.getElementById('prevPageBtn');
var nextPageBtn   = document.getElementById('nextPageBtn');

var detailModal   = document.getElementById('detailModal');
var modalBackdrop = document.getElementById('modalBackdrop');
var modalCloseBtn = document.getElementById('modalCloseBtn');
var modalBody     = document.getElementById('modalBody');

// ── Fetch helpers ─────────────────────────────────────────────────
function apiFetch(url) {
    return fetch(url).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    });
}

// Follow wger's pagination until all results are collected
function fetchAll(url) {
    var results = [];
    function next(pageUrl) {
        return apiFetch(pageUrl).then(function(data) {
            results = results.concat(data.results);
            if (data.next) return next(data.next);
            return results;
        });
    }
    return next(url);
}

// ── Bootstrap ─────────────────────────────────────────────────────
function init() {
    favorites = JSON.parse(localStorage.getItem('exerciseLibFavs') || '[]');

    // exerciseinfo returns fully nested objects — one endpoint, no lookup maps needed
    fetchAll(API_BASE + '/exerciseinfo/?format=json&language=' + ENGLISH_LANGUAGE_ID + '&limit=100')
        .then(function(raw) {
            allExercises = raw.map(processExercise).filter(function(ex) {
                return ex.name; // drop exercises with no English name
            });

            populateFilterDropdowns();
            applyFiltersAndRender();
            showGrid();
            renderFavoritesStrip();
        })
        .catch(function(err) {
            console.error(err);
            showError();
        });
}

// Pull English name + description out of the translations array
function getEnglishTranslation(translations) {
    // Prefer exact English (language 2)
    var eng = translations.find(function(t) { return t.language === ENGLISH_LANGUAGE_ID; });
    if (eng) return eng;
    // Fall back to first translation with a name
    return translations.find(function(t) { return t.name; }) || null;
}

// Normalise a raw exerciseinfo object
function processExercise(raw) {
    var t = getEnglishTranslation(raw.translations || []);
    var name = t ? stripHtml(t.name || '') : '';
    var description = t ? stripHtml(t.description || '') : '';

    return {
        id:               raw.id,
        name:             name,
        description:      description,
        category:         raw.category ? raw.category.name : '',
        categoryId:       raw.category ? raw.category.id   : null,
        muscles:          (raw.muscles || []).map(function(m) { return m.name_en || m.name; }),
        musclesSecondary: (raw.muscles_secondary || []).map(function(m) { return m.name_en || m.name; }),
        equipment:        (raw.equipment || []).map(function(e) { return e.name; }),
        image:            getMainImage(raw.images || [])
    };
}

function getMainImage(images) {
    var main = images.find(function(img) { return img.is_main; });
    return (main && main.thumbnails && main.thumbnails.medium) ? main.thumbnails.medium : null;
}

function stripHtml(str) {
    return str
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Dropdowns — derived from loaded data ─────────────────────────
function populateFilterDropdowns() {
    var categories = {}, equipment = {};

    allExercises.forEach(function(ex) {
        if (ex.category && ex.categoryId) categories[ex.categoryId] = ex.category;
        ex.equipment.forEach(function(e) { equipment[e] = e; });
    });

    Object.entries(categories)
        .sort(function(a, b) { return a[1].localeCompare(b[1]); })
        .forEach(function(entry) {
            var opt = document.createElement('option');
            opt.value = entry[0];
            opt.textContent = entry[1];
            categoryFilter.appendChild(opt);
        });

    Object.keys(equipment)
        .sort()
        .forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            equipmentFilter.appendChild(opt);
        });
}

// ── Filter + sort + paginate ──────────────────────────────────────
function applyFiltersAndRender() {
    var query   = searchInput.value.trim().toLowerCase();
    var catId   = categoryFilter.value;
    var equip   = equipmentFilter.value;
    var sortVal = sortSelect.value;

    filteredExercises = allExercises.filter(function(ex) {
        var matchSearch = !query ||
            ex.name.toLowerCase().includes(query) ||
            ex.description.toLowerCase().includes(query) ||
            ex.muscles.some(function(m) { return m.toLowerCase().includes(query); });

        var matchCat   = !catId  || String(ex.categoryId) === catId;
        var matchEquip = !equip  || ex.equipment.some(function(e) { return e === equip; });

        return matchSearch && matchCat && matchEquip;
    });

    filteredExercises.sort(function(a, b) {
        if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
        if (sortVal === 'muscle')    return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
    });

    currentPage = 1;
    renderPage();
}

function renderPage() {
    var total      = filteredExercises.length;
    var totalPages = Math.max(1, Math.ceil(total / EXERCISES_PER_PAGE));
    if (currentPage > totalPages) currentPage = totalPages;

    var start = (currentPage - 1) * EXERCISES_PER_PAGE;
    var slice = filteredExercises.slice(start, start + EXERCISES_PER_PAGE);

    resultsCount.textContent = total + ' exercise' + (total !== 1 ? 's' : '') + ' found';

    if (total === 0) {
        exerciseGrid.classList.add('hidden');
        pagination.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    exerciseGrid.classList.remove('hidden');
    exerciseGrid.innerHTML = '';

    slice.forEach(function(ex, i) {
        exerciseGrid.appendChild(buildCard(ex, i));
    });

    if (totalPages <= 1) {
        pagination.classList.add('hidden');
    } else {
        pagination.classList.remove('hidden');
        pageInfo.textContent = 'Page ' + currentPage + ' of ' + totalPages;
        prevPageBtn.disabled = currentPage === 1;
        nextPageBtn.disabled = currentPage === totalPages;
    }
}

// ── Card builder ──────────────────────────────────────────────────
function buildCard(ex, animIndex) {
    var isFav = favorites.includes(ex.id);
    var card  = document.createElement('div');
    card.className = 'exercise-card';
    card.style.animationDelay = (animIndex * 0.03) + 's';

    var tagsHtml = '';
    if (ex.category) tagsHtml += '<span class="tag tag-cat">' + ex.category + '</span>';
    ex.muscles.slice(0, 2).forEach(function(m) {
        tagsHtml += '<span class="tag tag-muscle">' + m + '</span>';
    });
    if (ex.equipment[0]) tagsHtml += '<span class="tag tag-equip">' + ex.equipment[0] + '</span>';

    var descSnippet = ex.description
        ? ex.description.slice(0, 110) + (ex.description.length > 110 ? '…' : '')
        : 'No description available.';

    var imgHtml = ex.image
        ? '<img class="card-img" src="' + ex.image + '" alt="' + ex.name + '" loading="lazy">'
        : '';

    card.innerHTML =
        imgHtml +
        '<div class="card-header">' +
            '<div class="card-name">' + ex.name + '</div>' +
            '<button class="card-fav ' + (isFav ? 'active' : '') + '" data-id="' + ex.id + '" title="' + (isFav ? 'Remove' : 'Save') + '">' +
                (isFav ? '★' : '☆') +
            '</button>' +
        '</div>' +
        '<div class="card-tags">' + tagsHtml + '</div>' +
        '<div class="card-desc">' + descSnippet + '</div>' +
        '<div class="card-footer"><span class="card-detail-link">View details →</span></div>';

    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('card-fav')) return;
        openModal(ex);
    });

    card.querySelector('.card-fav').addEventListener('click', function(e) {
        e.stopPropagation();
        toggleFavorite(ex.id, this);
    });

    return card;
}

// ── Favorites ─────────────────────────────────────────────────────
function toggleFavorite(id, btn) {
    var idx = favorites.indexOf(id);
    if (idx === -1) {
        favorites.push(id);
        if (btn) { btn.textContent = '★'; btn.classList.add('active'); }
    } else {
        favorites.splice(idx, 1);
        if (btn) { btn.textContent = '☆'; btn.classList.remove('active'); }
    }
    localStorage.setItem('exerciseLibFavs', JSON.stringify(favorites));
    renderFavoritesStrip();
}

function renderFavoritesStrip() {
    var existing = document.getElementById('favSection');
    if (favorites.length === 0) {
        if (existing) existing.remove();
        return;
    }

    if (!existing) {
        existing = document.createElement('div');
        existing.id = 'favSection';
        existing.className = 'fav-section';
        var filterBar = document.querySelector('.filter-bar');
        filterBar.parentNode.insertBefore(existing, filterBar.nextSibling);
    }

    var favExercises = favorites
        .map(function(id) { return allExercises.find(function(ex) { return ex.id === id; }); })
        .filter(Boolean);

    existing.innerHTML =
        '<div class="fav-heading">⭐ Saved Exercises (' + favExercises.length + ')</div>' +
        '<div class="fav-chips">' +
            favExercises.map(function(ex) {
                return '<span class="fav-chip" data-id="' + ex.id + '">' + ex.name + '</span>';
            }).join('') +
        '</div>';

    existing.querySelectorAll('.fav-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
            var id = parseInt(this.dataset.id);
            var ex = allExercises.find(function(e) { return e.id === id; });
            if (ex) openModal(ex);
        });
    });
}

// ── Modal ─────────────────────────────────────────────────────────
function openModal(ex) {
    var isFav = favorites.includes(ex.id);

    var primaryHtml = ex.muscles.map(function(m) {
        return '<span class="muscle-badge">' + m + '</span>';
    }).join('');

    var secondaryHtml = ex.musclesSecondary.map(function(m) {
        return '<span class="muscle-badge secondary">' + m + '</span>';
    }).join('');

    var equipStr = ex.equipment.length ? ex.equipment.join(', ') : 'Bodyweight / no equipment';

    var descHtml = ex.description
        ? '<p>' + ex.description.replace(/\n+/g, '</p><p>') + '</p>'
        : '<p>No description available for this exercise.</p>';

    var imgHtml = ex.image
        ? '<img class="modal-img" src="' + ex.image + '" alt="' + ex.name + '">'
        : '';

    modalBody.innerHTML =
        imgHtml +
        '<div class="modal-title">' + ex.name + '</div>' +
        '<div class="modal-tags">' +
            (ex.category ? '<span class="tag tag-cat">' + ex.category + '</span>' : '') +
            ex.equipment.map(function(e) { return '<span class="tag tag-equip">' + e + '</span>'; }).join('') +
        '</div>' +

        (ex.muscles.length
            ? '<div class="modal-section-label">Primary Muscles</div><div class="modal-muscles">' + primaryHtml + '</div>'
            : '') +

        (ex.musclesSecondary.length
            ? '<div class="modal-section-label">Secondary Muscles</div><div class="modal-muscles">' + secondaryHtml + '</div>'
            : '') +

        '<div class="modal-section-label">Equipment</div>' +
        '<div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:4px;">' + equipStr + '</div>' +

        '<div class="modal-section-label">Description</div>' +
        '<div class="modal-description">' + descHtml + '</div>' +

        '<button class="modal-add-btn" id="modalFavBtn">' +
            (isFav ? '★ Remove from Saved' : '☆ Save Exercise') +
        '</button>';

    document.getElementById('modalFavBtn').addEventListener('click', function() {
        toggleFavorite(ex.id, null);
        var nowFav = favorites.includes(ex.id);
        this.textContent = nowFav ? '★ Remove from Saved' : '☆ Save Exercise';
        var cardBtn = exerciseGrid.querySelector('[data-id="' + ex.id + '"]');
        if (cardBtn) {
            cardBtn.textContent = nowFav ? '★' : '☆';
            cardBtn.classList.toggle('active', nowFav);
        }
    });

    detailModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    detailModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ── State display helpers ─────────────────────────────────────────
function showGrid() {
    loadingState.classList.add('hidden');
    errorState.classList.add('hidden');
}

function showError() {
    loadingState.classList.add('hidden');
    exerciseGrid.classList.add('hidden');
    errorState.classList.remove('hidden');
}

// ── Event listeners ───────────────────────────────────────────────
searchInput.addEventListener('input', applyFiltersAndRender);
categoryFilter.addEventListener('change', applyFiltersAndRender);
equipmentFilter.addEventListener('change', applyFiltersAndRender);
sortSelect.addEventListener('change', applyFiltersAndRender);

resetBtn.addEventListener('click', function() {
    searchInput.value = '';
    categoryFilter.value = '';
    equipmentFilter.value = '';
    sortSelect.value = 'name-asc';
    applyFiltersAndRender();
});

retryBtn.addEventListener('click', function() {
    errorState.classList.add('hidden');
    loadingState.classList.remove('hidden');
    init();
});

prevPageBtn.addEventListener('click', function() {
    if (currentPage > 1) { currentPage--; renderPage(); window.scrollTo(0, 0); }
});

nextPageBtn.addEventListener('click', function() {
    var totalPages = Math.ceil(filteredExercises.length / EXERCISES_PER_PAGE);
    if (currentPage < totalPages) { currentPage++; renderPage(); window.scrollTo(0, 0); }
});

modalCloseBtn.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModal();
});

// ── Start ─────────────────────────────────────────────────────────
init();
