# TODO - Employees Attendance Feature (Theme: Admin + Employee)

- [ ] Inspect existing API patterns for auth + apiFetch usage (frontend + backend)
- [ ] Backend: Add Attendance model to `server/prisma/schema.prisma` (MongoDB)
- [ ] Backend: Add `/api/attendance` routes
  - [ ] User mark attendance (Present/Absent) for own user + selected date
  - [ ] Admin update attendance for any user/date
  - [ ] List attendance + compute attendance % for date range (for UI)
- [ ] Backend: Mount routes in `server/src/app.js`
- [ ] Frontend: Redesign Employees section in `src/pages/TeamAnalytics.tsx`
  - [ ] Date picker
  - [ ] Admin attendance table (Present/Absent) with save
  - [ ] Employee self mark (submit)
  - [ ] Attendance % summary per employee
- [ ] Enforce permissions:
  - [ ] Employees can NOT edit after submit (server validation)
  - [ ] Admin can edit anytime
- [ ] Run local build/dev checks
- [ ] Manual UI verification for overlap regression (Ask AI widget + Employees page)
- [ ] Final code review
