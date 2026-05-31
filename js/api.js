// ==================== API SERVICE LAYER ====================
// Unified interface for all Student Academics data operations.
//
// - Endpoints that exist on the backend make real fetch calls.
// - Endpoints not yet built (sessions, session-types, status toggles)
//   manage the in-memory arrays (sessionsData, sessionTypesData, _ayLocalData)
//   so the UI works end-to-end today, and can be upgraded to real calls
//   by replacing the function body when the backend is ready.

// ── Shared helpers ───────────────────────────────────────────

function _apiJsonHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function _apiBearerHeaders() {
  return { Authorization: `Bearer ${token}` };
}

async function _apiHandleResponse(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: res.ok ? body : null, detail: body.detail || null };
}

// ── Academic Years ────────────────────────────────────────────
// Real backend: /academic-years/

async function apiAcademicYearsList() {
  try {
    const res = await fetch(`${API_BASE}/academic-years/`, { headers: _apiBearerHeaders() });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: [], detail: 'Network error.' };
  }
}

async function apiAcademicYearsCreate(payload) {
  // payload: { name, start_date, end_date }
  try {
    const res = await fetch(`${API_BASE}/academic-years/`, {
      method: 'POST', headers: _apiJsonHeaders(), body: JSON.stringify(payload)
    });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: null, detail: 'Network error.' };
  }
}

async function apiAcademicYearsGet(id) {
  try {
    const res = await fetch(`${API_BASE}/academic-years/${id}`, { headers: _apiBearerHeaders() });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: null, detail: 'Network error.' };
  }
}

async function apiAcademicYearsUpdate(id, payload) {
  // PUT /academic-years/:id — not yet available on the backend.
  // Persists changes to the local cache (_ayLocalData) until the endpoint exists.
  const idx = (typeof _ayLocalData !== 'undefined') ? _ayLocalData.findIndex(y => y.id === id) : -1;
  if (idx !== -1) Object.assign(_ayLocalData[idx], payload);
  return { ok: true, data: { id, ...payload }, detail: null };
}

async function apiAcademicYearsToggleStatus(id) {
  // PATCH /academic-years/:id/status — not yet available on the backend.
  const idx = (typeof _ayLocalData !== 'undefined') ? _ayLocalData.findIndex(y => y.id === id) : -1;
  if (idx !== -1) _ayLocalData[idx].is_inactive = !_ayLocalData[idx].is_inactive;
  return { ok: true, data: null, detail: null };
}

async function apiAcademicYearsUpdateTermDates(yearId, termId, payload) {
  // payload: { actual_start, actual_end }
  try {
    const res = await fetch(`${API_BASE}/academic-years/${yearId}/terms/${termId}`, {
      method: 'PATCH', headers: _apiJsonHeaders(), body: JSON.stringify(payload)
    });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: null, detail: 'Network error.' };
  }
}

// ── Session Types ─────────────────────────────────────────────
// No backend yet — managed via in-memory sessionTypesData.
// When GET /api/session-types is ready, replace each body with a fetch call.

async function apiSessionTypesList() {
  const data = typeof sessionTypesData !== 'undefined' ? [...sessionTypesData] : [];
  return { ok: true, data, detail: null };
}

async function apiSessionTypesCreate(payload) {
  // payload: { title, notes, is_inactive }
  if (typeof sessionTypesData === 'undefined') return { ok: false, data: null, detail: 'Not initialised.' };
  const item = {
    id:          'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title:       payload.title || '',
    notes:       payload.notes || '',
    is_inactive: payload.is_inactive ?? false
  };
  sessionTypesData.push(item);
  return { ok: true, data: item, detail: null };
}

async function apiSessionTypesGet(id) {
  const item = (typeof sessionTypesData !== 'undefined') ? sessionTypesData.find(t => t.id === id) : null;
  return item ? { ok: true, data: item, detail: null } : { ok: false, data: null, detail: 'Not found.' };
}

async function apiSessionTypesUpdate(id, payload) {
  // payload: { title, notes, is_inactive }
  if (typeof sessionTypesData === 'undefined') return { ok: false, data: null, detail: 'Not initialised.' };
  const idx = sessionTypesData.findIndex(t => t.id === id);
  if (idx === -1) return { ok: false, data: null, detail: 'Not found.' };
  sessionTypesData[idx] = { ...sessionTypesData[idx], ...payload };
  return { ok: true, data: sessionTypesData[idx], detail: null };
}

async function apiSessionTypesToggleStatus(id) {
  if (typeof sessionTypesData === 'undefined') return { ok: false, detail: 'Not initialised.' };
  const idx = sessionTypesData.findIndex(t => t.id === id);
  if (idx !== -1) sessionTypesData[idx].is_inactive = !sessionTypesData[idx].is_inactive;
  return { ok: true, data: null, detail: null };
}

// ── Sessions ──────────────────────────────────────────────────
// No backend yet — managed via in-memory sessionsData.

async function apiSessionsList(filters = {}) {
  // filters: { academic_year_id, session_type_id, status }
  if (typeof sessionsData === 'undefined') return { ok: true, data: [], detail: null };
  let data = [...sessionsData];
  if (filters.academic_year_id) data = data.filter(s => s.academic_year_id == filters.academic_year_id);
  if (filters.session_type_id)  data = data.filter(s => s.session_type_id  === filters.session_type_id);
  if (filters.status === 'active')   data = data.filter(s => !s.is_inactive);
  if (filters.status === 'inactive') data = data.filter(s =>  s.is_inactive);
  return { ok: true, data, detail: null };
}

async function apiSessionsCreate(payload) {
  // payload: { title, session_type_id, academic_year_id, start_date, end_date, notes, is_inactive }
  if (typeof sessionsData === 'undefined') return { ok: false, data: null, detail: 'Not initialised.' };
  const item = {
    id:               'sess' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    title:            payload.title            || '',
    session_type_id:  payload.session_type_id  || '',
    academic_year_id: payload.academic_year_id || null,
    start_date:       payload.start_date       || '',
    end_date:         payload.end_date         || '',
    notes:            payload.notes            || '',
    is_inactive:      payload.is_inactive      ?? false
  };
  sessionsData.push(item);
  return { ok: true, data: item, detail: null };
}

async function apiSessionsGet(id) {
  const item = (typeof sessionsData !== 'undefined') ? sessionsData.find(s => s.id === id) : null;
  return item ? { ok: true, data: item, detail: null } : { ok: false, data: null, detail: 'Not found.' };
}

async function apiSessionsUpdate(id, payload) {
  if (typeof sessionsData === 'undefined') return { ok: false, data: null, detail: 'Not initialised.' };
  const idx = sessionsData.findIndex(s => s.id === id);
  if (idx === -1) return { ok: false, data: null, detail: 'Not found.' };
  sessionsData[idx] = { ...sessionsData[idx], ...payload };
  return { ok: true, data: sessionsData[idx], detail: null };
}

async function apiSessionsToggleStatus(id) {
  if (typeof sessionsData === 'undefined') return { ok: false, detail: 'Not initialised.' };
  const idx = sessionsData.findIndex(s => s.id === id);
  if (idx !== -1) sessionsData[idx].is_inactive = !sessionsData[idx].is_inactive;
  return { ok: true, data: null, detail: null };
}

// ── Attendance ────────────────────────────────────────────────
// Real backend endpoints; extra filter params passed as query strings
// where the backend supports them.

async function apiAttendanceClassSheet(filters = {}) {
  // filters: { date, class_id, stage_id, session_id, schedule, stream, student }
  const params = new URLSearchParams();
  if (filters.date)     params.set('class_date', filters.date);
  if (filters.class_id) params.set('class_id',   filters.class_id);
  try {
    const res = await fetch(`${API_BASE}/attendance/class-sheet?${params}`, {
      headers: _apiBearerHeaders()
    });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: { students: [] }, detail: 'Network error.' };
  }
}

async function apiAttendanceBulkSave(date, entries) {
  // entries: [{ student_id, status, notes }]
  try {
    const res = await fetch(`${API_BASE}/attendance/bulk?class_date=${date}`, {
      method: 'POST', headers: _apiJsonHeaders(), body: JSON.stringify(entries)
    });
    return await _apiHandleResponse(res);
  } catch(e) {
    return { ok: false, data: null, detail: 'Network error.' };
  }
}

async function apiAttendanceReport(filters = {}) {
  // filters: { session_id, attendance_schedule, stage_id, stage_name, stream,
  //            start_date, end_date, status, gender, student }
  // A dedicated GET /api/attendance/report endpoint with date-range support
  // is not yet available. We proxy to class-sheet using start_date for now.
  const date = filters.start_date || new Date().toISOString().split('T')[0];
  try {
    const res  = await fetch(`${API_BASE}/attendance/class-sheet?class_date=${date}`, {
      headers: _apiBearerHeaders()
    });
    if (!res.ok) return { ok: false, data: [], detail: (await res.json()).detail };
    const body = await res.json();
    let rows   = Array.isArray(body.students) ? body.students : [];

    // Client-side filtering for fields the backend doesn't filter on yet
    if (filters.student) {
      const q = filters.student.toLowerCase();
      rows = rows.filter(s => (s.student_name || '').toLowerCase().includes(q));
    }
    if (filters.status) {
      const apiStatus = filters.status === 'Half Day' ? 'Late' : filters.status;
      rows = rows.filter(s => s.current_status === apiStatus);
    }

    const data = rows.map(s => ({
      admission_no: '-',
      name:         s.student_name  || '',
      gender:       '-',
      stage:        filters.stage_name || '-',
      date,
      status:       s.current_status === 'Late' ? 'Half Day' : (s.current_status || '-'),
      reason:       '-'
    }));
    return { ok: true, data, detail: null };
  } catch(e) {
    return { ok: false, data: [], detail: 'Network error.' };
  }
}
