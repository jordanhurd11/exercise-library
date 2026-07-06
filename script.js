// ── Config ────────────────────────────────────────────────────────
var API_BASE = 'https://wger.de/api/v2';
var EXERCISES_PER_PAGE = 20;

// ── State ─────────────────────────────────────────────────────────
var allExercises = [];       // full fetched + processed list
var filteredExercises = [];  // after search/filter
var favorites = [];          // IDs saved to localStorage
var currentPage = 1;

var categoryMap = {};        // id -> name
var muscleMap = {};          // id -> name
var equipmentMap = {};       // id -> name

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

// Fetch every page of a paginated wger endpoint
function fetchAll(endpoint) {
    var results = [];
    function fetchPage(url) {
        return apiFetch(url).then(function(data) {
            results = results.concat(data.results);
            if (data.next) return fetchPage(data.next);
            return results;
        });
    }
    return fetchPage(API_BASE + endpoint);
}

// ── Bootstrap: load lookup tables then exercises ──────────────────
function init() {
    favorites = JSON.parse(localStorage.getItem('exerciseLibFavs') || '[]');

    Promise.all([
        fetchAll('/exercisecategory/?format=json&limit=100'),
        fetchAll('/muscle/?format=json&limit=100'),
        fetchAll('/equipment/?format=json&limit=100')
    ]).then(function(results) {
        // Build lookup maps
        results[0].forEach(function(c) { categoryMap[c.id] = c.name; });
        results[1].forEach(function(m) { muscleMap[m.id] = m.name; });
        results[2].forEach(function(e) { equipmentMap[e.id] = e.name; });

        populateFilterDropdowns(results[0], results[2]);

        // Fetch English exercises (language=2 is English in wger)
        return fetchAll('/exercise/?format=json&language=2&limit=100');
    }).then(function(exercises) {
        allExercises = exercises.map(processExercise);
        applyFiltersAndRender();
        showGrid();
    }).catch(function(err) {
        console.error(err);
        showError();
    });
}

// Normalise a raw exercise object into a clean shape
function processExercise(ex) {
    return {
        id: ex.id,
        name: stripHtml(ex.name || 'Unnamed Exercise'),
        description: stripHtml(ex.description || ''),
        category: ex.category ? (categoryMap[ex.category] || ex.category) : '',
        muscles: (ex.muscles || []).map(function(id) { return muscleMap[id] || ('Muscle ' + id); }),
        musclesSecondary: (ex.muscles_secondary || []).map(function(id) { return muscleMap[id] || ('Muscle ' + id); }),
        equipment: (ex.equipment || []).map(function(id) { return equipmentMap[id] || ('Equipment ' + id); }),
        categoryId: ex.category || null,
        equipmentIds: ex.equipment || []
    };
}

function stripHtml(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

// ── Dropdowns ─────────────────────────────────────────────────────
function populateFilterDropdowns(categories, equipment) {
    categories.sort(function(a, b) { return a.name.localeCompare(b.name); });
    categories.forEach(function(c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        categoryFilter.appendChild(opt);
    });

    equipment.sort(function(a, b) { return a.name.localeCompare(b.name); });
    equipment.forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        equipmentFilter.appendChild(opt);
    });
}

// ── Filter + sort + paginate ───────────────────────────────────────
function applyFiltersAndRender() {
    var query    = searchInput.value.trim().toLowerCase();
    var catId    = categoryFilter.value;
    var equipId  = equipmentFilter.value;
    var sortVal  = sortSelect.value;

    filteredExercises = allExercises.filter(function(ex) {
        var matchSearch = !query ||
            ex.name.toLowerCase().includes(query) ||
            ex.description.toLowerCase().includes(query) ||
            ex.muscles.some(function(m) { return m.toLowerCase().includes(query); });

        var matchCat   = !catId   || String(ex.categoryId) === catId;
        var matchEquip = !equipId || ex.equipmentIds.some(function(id) { return String(id) === equipId; });

        return matchSearch && matchCat && matchEquip;
    });

    // Sort
    filteredExercises.sort(function(a, b) {
        if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
        if (sortVal === 'muscle')    return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name); // default: name-asc
    });

    currentPage = 1;
    renderPage();
}

function renderPage() {
    var total = filteredExercises.length;
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
        var card = buildCard(ex, i);
        exerciseGrid.appendChild(card);
    });

    // Pagination
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

    var card = document.createElement('div');
    card.className = 'exercise-card';
    card.style.animationDelay = (animIndex * 0.03) + 's';

    var tagsHtml = '';
    if (ex.category) tagsHtml += '<span class="tag tag-cat">' + ex.category + '</span>';
    ex.muscles.slice(0, 2).forEach(function(m) {
        tagsHtml += '<span class="tag tag-muscle">' + m + '</span>';
    });
    ex.equipment.slice(0, 1).forEach(function(e) {
        tagsHtml += '<span class="tag tag-equip">' + e + '</span>';
    });

    var descSnippet = ex.description ? ex.description.slice(0, 120) + (ex.description.length > 120 ? '…' : '') : 'No description available.';

    card.innerHTML =
        '<div class="card-header">' +
            '<div class="card-name">' + ex.name + '</div>' +
            '<button class="card-fav ' + (isFav ? 'active' : '') + '" data-id="' + ex.id + '" title="' + (isFav ? 'Remove from favorites' : 'Add to favorites') + '">' +
                (isFav ? '★' : '☆') +
            '</button>' +
        '</div>' +
        '<div class="card-tags">' + tagsHtml + '</div>' +
        '<div class="card-desc">' + descSnippet + '</div>' +
        '<div class="card-footer"><span class="card-detail-link">View details →</span></div>';

    // Click card body → open modal
    card.addEventListener('click', function(e) {
        if (e.target.classList.contains('card-fav')) return;
        openModal(ex);
    });

    // Favorite button
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
        btn.textContent = '★';
        btn.classList.add('active');
        btn.title = 'Remove from favorites';
    } else {
        favorites.splice(idx, 1);
        btn.textContent = '☆';
        btn.classList.remove('active');
        btn.title = 'Add to favorites';
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

    var favExercises = favorites.map(function(id) {
        return allExercises.find(function(ex) { return ex.id === id; });
    }).filter(Boolean);

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

    var primaryMuscles = ex.muscles.map(function(m) {
        return '<span class="muscle-badge">' + m + '</span>';
    }).join('');

    var secondaryMuscles = ex.musclesSecondary.map(function(m) {
        return '<span class="muscle-badge secondary">' + m + '</span>';
    }).join('');

    var equipmentList = ex.equipment.length ? ex.equipment.join(', ') : 'No equipment / bodyweight';

    var descHtml = ex.description
        ? ex.description.split('\n').filter(Boolean).map(function(p) { return '<p>' + p + '</p>'; }).join('')
        : '<p>No description available for this exercise.</p>';

    modalBody.innerHTML =
        '<div class="modal-title">' + ex.name + '</div>' +
        '<div class="modal-tags">' +
            (ex.category ? '<span class="tag tag-cat">' + ex.category + '</span>' : '') +
            ex.equipment.map(function(e) { return '<span class="tag tag-equip">' + e + '</span>'; }).join('') +
        '</div>' +

        (ex.muscles.length ?
            '<div class="modal-section-label">Primary Muscles</div>' +
            '<div class="modal-muscles">' + primaryMuscles + '</div>' : '') +

        (ex.musclesSecondary.length ?
            '<div class="modal-section-label">Secondary Muscles</div>' +
            '<div class="modal-muscles">' + secondaryMuscles + '</div>' : '') +

        '<div class="modal-section-label">Equipment</div>' +
        '<div style="font-size:0.88rem;color:var(--text-muted);margin-bottom:4px;">' + equipmentList + '</div>' +

        '<div class="modal-section-label">Description</div>' +
        '<div class="modal-description">' + descHtml + '</div>' +

        '<button class="modal-add-btn" id="modalFavBtn">' +
            (isFav ? '★ Remove from Saved' : '☆ Save Exercise') +
        '</button>';

    document.getElementById('modalFavBtn').addEventListener('click', function() {
        toggleFavorite(ex.id, null);
        var nowFav = favorites.includes(ex.id);
        this.textContent = nowFav ? '★ Remove from Saved' : '☆ Save Exercise';
        // also update card star if visible
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
