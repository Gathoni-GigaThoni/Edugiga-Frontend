// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
let token = "";
let currentUser = null;   // decoded JWT payload after login

// ==================== DATA STORES ====================
const employeesData = [];
const employeeServiceProfilesData = [];
const financialInstitutionsData = [];
