# EduGiga Frontend — Seven Oaks International School

A vanilla JS / HTML / CSS school management frontend. All data is served by a REST backend; in-memory arrays are used for features not yet wired to the backend.

## Running locally

Serve the project root as static files. Any static file server works:

```bash
# Python (built-in)
python3 -m http.server 3000

# Node.js (npx)
npx serve .

# VS Code
# Install the "Live Server" extension, right-click index.html → Open with Live Server
```

Open `http://localhost:3000` in your browser.

## Backend URL

The API base URL is set in `js/config.js`:

```js
const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
```

Change this value to point at a local or staging backend.

## Authentication

- Login POSTs to `POST /auth/login` (form-encoded `username` + `password`).
- The returned JWT is stored in `sessionStorage` under the key `edugiga_token` so a page refresh keeps the user logged in until the token expires.
- A silent refresh is attempted every 10 minutes via `POST /auth/refresh` (backend optional).
- All fetch calls go through `apiFetch()` in `config.js` which attaches the `Authorization` header and redirects to login on 401.

## Project structure

```
index.html          — entry point; loads all CSS and JS
css/
  core.css          — global styles + shared utilities (action-dropdown, pagination, toast, print)
  finance.css       — Finance module styles
  hr.css            — HR module styles
  ...
js/
  config.js         — API_BASE, token, apiFetch(), showToast()
  auth.js           — login(), logout(), token refresh
  ui-helpers.js     — renderPaginatedTable(), renderSkeletonRows(), exportTableCSV()
  dashboard.js      — sidebar, loadView() router
  students.js       — Student Management + Student Reports
  attendance.js     — Attendance Register + Reports
  finance.js        — Finance module
  hr-list.js        — HR employee listing, filters, shared tab helpers
  hr-add.js         — HR add-employee form
  hr-edit.js        — HR edit-employee form
  hr-esp-form.js    — Employee Service Profile form
  payroll.js        — Payroll module
  roles.js          — Role / permission management + NAV_STRUCTURE
  api.js            — API service layer (academic years, sessions, attendance)
  ...
```

## Notes

- Data in in-memory arrays (employees, sessions, etc.) resets on page reload by design.
- No build step required — all files are plain JS/CSS served directly.
