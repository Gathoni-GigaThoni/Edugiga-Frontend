// app.js has been split into per-module files under js/.
// This file is no longer loaded by index.html.
//
// Load order (defined in index.html):
//   js/config.js          — API_BASE, global state, data stores
//   js/auth.js            — login, logout
//   js/dashboard.js       — showDashboard, loadView, sidebar helpers, closeModal
//   js/students.js        — Student Management
//   js/attendance.js      — Attendance Register
//   js/transport.js       — Transport Management
//   js/academics.js       — Academic Year Setup
//   js/finance.js         — Finance / Student Fees
//   js/reports.js         — Reports
//   js/administration.js  — Staff Administration
//   js/user-management.js — User Management
//   js/roles.js           — Roles + NAV_STRUCTURE
//   js/hr.js              — Human Resource module
