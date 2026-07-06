# Exercise Library Browser

A searchable exercise database — browse by muscle group or equipment, save favorites, and learn how to perform any exercise.

**Live Site:** https://jordanhurd11.github.io/exercise-library/

**API Used:** [wger Workout Manager REST API](https://wger.de/api/v2/) — no key required

---

## What It Does

- Browse 200+ exercises fetched live from the wger API
- Search by exercise name, muscle, or keyword
- Filter by muscle group and equipment
- Click any card to view a detail modal: primary/secondary muscles, equipment needed, and full description
- Star any exercise to save it to favorites (persisted in localStorage)
- Paginated grid with sort options (A–Z, Z–A, by muscle group)

## Screenshot

*(add screenshot here)*

---

## Technical Concepts Used

**`fetch()` and Promises**
All data is loaded asynchronously with `fetch()`. The app uses `Promise.all()` to fetch categories, muscles, and equipment lookups in parallel before fetching exercises.

**Paginated API traversal**
wger returns 20 results per page with a `next` URL. A recursive `fetchAll()` function follows every `next` link until all exercises are loaded.

**localStorage for favorites**
Saved exercises persist across page reloads using `localStorage.setItem` / `getItem`.

**Loading, error, and empty states**
The UI shows a spinner while fetching, a friendly error message with a retry button if the API fails, and an empty-state message when filters return no results.

---

Built with vanilla JavaScript, HTML, and CSS. No frameworks, no libraries, no server.
