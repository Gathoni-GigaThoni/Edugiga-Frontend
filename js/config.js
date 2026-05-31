// app.js

const API_BASE = "https://edu-giga-school-management-system-1.onrender.com";
let token = "";
let currentUser = null;   // decoded JWT payload after login

// ==================== DATA STORES ====================
const employeesData = [];
const employeeServiceProfilesData = [];
const financialInstitutionsData = [];

// Finance
let studentInvoicesData            = [];
let sessionData                    = [];
let studentClassesData             = [];
let studentInvoiceAdjustmentsData  = [];
let sponsorshipAllocationsData     = [];
let feeSetupPerClassData           = [];
let receivePaymentsData            = [];
let chartOfAccountsData            = [];
let feeAccountsData                = [];
