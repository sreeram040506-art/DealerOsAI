import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock, RefreshCw, Save, Search, UserCheck, UserX, Users } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import QueryErrorState from '@/components/QueryErrorState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/context/auth-hooks';
import { toast } from 'sonner';

type AttendanceStatus = 'PRESENT' | 'ABSENT';
type AttendanceRecord = { date: string; status: AttendanceStatus | null };
type AttendanceUser = {
  userId: string;
  name: string;
  role: string;
  attendancePercent: number;
  days: string[];
  markedDays: number;
  presentDays: number;
  records: AttendanceRecord[];
};
type AttendanceResponse = {
  users?: AttendanceUser[];
  message?: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartDate() {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

export default function Attendance() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [rangeFrom, setRangeFrom] = useState(monthStartDate);
  const [rangeTo, setRangeTo] = useState(todayDate);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceUsers, setAttendanceUsers] = useState<AttendanceUser[]>([]);
  const [draftStatusByUserId, setDraftStatusByUserId] = useState<Record<string, AttendanceStatus>>({});
  const [savingByUserId, setSavingByUserId] = useState<Record<string, boolean>>({});

  const visibleUsers = useMemo(() => {
    if (isAdmin) return attendanceUsers;
    return attendanceUsers.filter((u) => u.userId === user?.id);
  }, [attendanceUsers, isAdmin, user?.id]);

  const [appliedRange, setAppliedRange] = useState({ from: rangeFrom, to: rangeTo });

  const loadAttendance = useCallback(async (fromDate?: string, toDate?: string) => {
    if (!token) return;
    const qFrom = fromDate ?? appliedRange.from;
    const qTo = toDate ?? appliedRange.to;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ from: qFrom, to: qTo });
      const response = await fetch(apiUrl(`/attendance?${query.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: AttendanceResponse = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to load attendance');
      }
      setAttendanceUsers(data.users || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load attendance';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [appliedRange, token]);

  const applyRange = () => {
    setAppliedRange({ from: rangeFrom, to: rangeTo });
    loadAttendance(rangeFrom, rangeTo);
  };

  useEffect(() => {
    loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const u of attendanceUsers) {
      const rec = u.records.find((r) => r.date === selectedDate);
      if (rec?.status) next[u.userId] = rec.status;
      else next[u.userId] = 'PRESENT';
    }
    setDraftStatusByUserId(next);
  }, [attendanceUsers, selectedDate]);

  const handleSelectStatus = (userId: string, status: AttendanceStatus) => {
    setDraftStatusByUserId((prev) => ({ ...prev, [userId]: status }));
  };

  const handleSelfSubmit = async (userId: string) => {
    if (!token) return;
    const status = draftStatusByUserId[userId];
    if (!status) return;

    setSavingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await fetch(apiUrl('/attendance/mark'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ date: selectedDate, status }),
      });
      const data: { message?: string } = await response.json();
      if (!response.ok) {
        toast.error(data.message || 'Unable to submit attendance');
        return;
      }
      toast.success('Attendance submitted');
      await loadAttendance();
    } catch {
      toast.error('Connection error while submitting attendance');
    } finally {
      setSavingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleAdminSave = async (userId: string) => {
    if (!token) return;
    const status = draftStatusByUserId[userId];
    if (!status) return;

    setSavingByUserId((prev) => ({ ...prev, [userId]: true }));
    try {
      const response = await fetch(apiUrl(`/attendance/${userId}/${selectedDate}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data: { message?: string } = await response.json();
      if (!response.ok) {
        toast.error(data.message || 'Unable to update attendance');
        return;
      }
      toast.success('Attendance updated');
      await loadAttendance();
    } catch {
      toast.error('Connection error while updating attendance');
    } finally {
      setSavingByUserId((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const totalPresent = visibleUsers.reduce((s, u) => s + u.presentDays, 0);
  const totalMarked = visibleUsers.reduce((s, u) => s + (u.markedDays || 0), 0);
  const avgPercent = visibleUsers.length > 0
    ? Math.round(visibleUsers.reduce((s, u) => s + u.attendancePercent, 0) / visibleUsers.length)
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        {/* Header */}
        <section className="relative overflow-hidden rounded-[32px] border border-border bg-white p-6 md:p-8 shadow-xl shadow-black/[0.02]">
          <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-primary shadow-sm">
                <CalendarDays className="h-3.5 w-3.5" />
                Operations
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-foreground leading-[1.1]">
                Attendance System
              </h1>
              <p className="text-sm text-muted-foreground font-medium max-w-xl">
                {isAdmin
                  ? 'Track and edit attendance for every team member in real time.'
                  : 'Mark your daily attendance and monitor your attendance trend.'}
              </p>
            </div>
            <Button
              onClick={loadAttendance}
              variant="outline"
              className="rounded-xl h-10 px-4 text-xs font-black uppercase tracking-widest gap-2 self-start"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </section>

        {/* Date Controls — single row */}
        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <form onSubmit={(e) => { e.preventDefault(); applyRange(); }} className="flex flex-col md:flex-row md:items-end gap-4">
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" /> Mark Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Range From</label>
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Range To</label>
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button type="submit" className="rounded-xl h-11 px-5 text-xs font-black uppercase tracking-widest gap-2 shrink-0">
              <Search className="w-4 h-4" /> Search
            </Button>
          </form>
        </section>

        {error && <QueryErrorState title="Attendance unavailable" description={error} onRetry={loadAttendance} />}

        {/* Summary Cards */}
        <section className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Team Members</p>
              <Users className="w-4 h-4 text-primary" />
            </div>
            <p className="text-2xl font-black text-foreground">{visibleUsers.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Present Days</p>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-600">{totalPresent}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Total Marked</p>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-black text-foreground">{totalMarked}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Avg Attendance</p>
              <CheckCircle2 className="w-4 h-4 text-primary" />
            </div>
            <p className={cn("text-2xl font-black", avgPercent >= 80 ? "text-emerald-600" : avgPercent >= 50 ? "text-amber-500" : "text-red-500")}>{avgPercent}%</p>
          </div>
        </section>

        {/* Attendance Control */}
        <section className="rounded-3xl border border-border bg-white p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Daily Attendance Control</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-sm text-muted-foreground font-bold">Loading attendance records...</p>
            </div>
          ) : visibleUsers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-muted-foreground">No attendance users found</p>
              <p className="text-xs text-muted-foreground mt-1">Adjust the date range or check team settings.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleUsers.map((u) => {
                const record = u.records.find((r) => r.date === selectedDate);
                const alreadySubmitted = !isAdmin && Boolean(record?.status);
                const draft = draftStatusByUserId[u.userId] || record?.status || 'PRESENT';
                const isSaving = Boolean(savingByUserId[u.userId]);
                const pct = u.attendancePercent;

                return (
                  <div key={u.userId} className="rounded-2xl border border-border bg-muted/10 p-4 md:p-5">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                          record?.status === 'PRESENT' ? "bg-emerald-500/10" : record?.status === 'ABSENT' ? "bg-red-500/10" : "bg-muted"
                        )}>
                          {record?.status === 'PRESENT' ? (
                            <UserCheck className="w-5 h-5 text-emerald-600" />
                          ) : record?.status === 'ABSENT' ? (
                            <UserX className="w-5 h-5 text-red-500" />
                          ) : (
                            <Users className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-foreground">{u.name}</p>
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border",
                              u.role === 'ADMIN' ? "bg-primary/10 text-primary border-primary/20" :
                              u.role === 'MANAGER' ? "bg-foreground/10 text-foreground border-foreground/20" :
                              "bg-muted text-muted-foreground border-border"
                            )}>
                              {u.role}
                            </span>
                            {alreadySubmitted && (
                              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-200">
                                Submitted
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">
                            {u.presentDays}/{u.markedDays || 0} present days
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 ml-14 md:ml-0">
                        {/* Progress bar */}
                        <div className="w-24 md:w-32">
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn(
                              "text-sm font-black",
                              pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-500" : "text-red-500"
                            )}>{pct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
                              )}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 grid-cols-2 md:grid-cols-[1fr_1fr_auto]">
                      <Button
                        type="button"
                        variant={draft === 'PRESENT' ? 'default' : 'outline'}
                        className={cn(
                          'rounded-xl h-10 font-black uppercase tracking-widest text-xs gap-2',
                          draft === 'PRESENT' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-border'
                        )}
                        disabled={alreadySubmitted || isSaving}
                        onClick={() => handleSelectStatus(u.userId, 'PRESENT')}
                      >
                        <UserCheck className="w-4 h-4" /> Present
                      </Button>
                      <Button
                        type="button"
                        variant={draft === 'ABSENT' ? 'default' : 'outline'}
                        className={cn(
                          'rounded-xl h-10 font-black uppercase tracking-widest text-xs gap-2',
                          draft === 'ABSENT' ? 'bg-red-500 hover:bg-red-600 text-white' : 'border-border'
                        )}
                        disabled={alreadySubmitted || isSaving}
                        onClick={() => handleSelectStatus(u.userId, 'ABSENT')}
                      >
                        <UserX className="w-4 h-4" /> Absent
                      </Button>

                      {isAdmin ? (
                        <Button
                          type="button"
                          className="rounded-xl h-10 px-5 font-black uppercase tracking-widest text-xs gap-2 col-span-2 md:col-span-1"
                          disabled={isSaving}
                          onClick={() => handleAdminSave(u.userId)}
                        >
                          <Save className="w-4 h-4" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="rounded-xl h-10 px-5 font-black uppercase tracking-widest text-xs gap-2 col-span-2 md:col-span-1"
                          disabled={alreadySubmitted || isSaving}
                          onClick={() => handleSelfSubmit(u.userId)}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {alreadySubmitted ? 'Submitted' : isSaving ? 'Submitting...' : 'Submit'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
