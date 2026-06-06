# TODO - Employees Attendance Feature (Theme: Admin + Employee)

- [x] Inspect existing API patterns for auth + apiFetch usage (frontend + backend)
- [x] Backend: Add Attendance model to `server/prisma/schema.prisma` (MongoDB)
- [x] Backend: Add `/api/attendance` routes
  - [x] User mark attendance (Present/Absent) for own user + selected date
  - [x] Admin update attendance for any user/date
  - [x] List attendance + compute attendance % for date range (for UI)
- [x] Backend: Mount routes in `server/src/app.js`
- [x] Frontend: Attendance page (`src/pages/Attendance.tsx`)
  - [x] Date picker
  - [x] Admin attendance table (Present/Absent) with save
  - [x] Employee self mark (submit)
  - [x] Attendance % summary per employee
- [x] Enforce permissions:
  - [x] Employees can NOT edit after submit (server validation)
  - [x] Admin can edit anytime
- [x] Bug fix: communicationRoutes used `req.dealership.id` instead of `req.dealershipId`
- [x] Bug fix: attendanceRoutes had redundant authenticateToken middleware
- [x] Run local build/dev checks
- [x] Manual UI verification for overlap regression (Ask AI widget + Employees page)
- [x] Final code review

