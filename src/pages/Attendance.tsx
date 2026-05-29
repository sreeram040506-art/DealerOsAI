import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, RefreshCw, Save, UserCheck, UserX, Users } from 'lucide-react';
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

  const loadAttendance = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ from: rangeFrom, to: rangeTo });
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
  }, [rangeFrom, rangeTo, token]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

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

  const mySummary = visibleUsers[0];

  return (
    <AppLayout>
      <div className="space-y-6 page-enter">
        <section className="rounded-3xl border border-border bg-white p-6 md:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Operations</p>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground mt-1">
                Attendance System
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdmin
                  ? 'Track and edit attendance for every team member in real time.'
                  : 'Mark your daily attendance and monitor your attendance trend.'}
              </p>
            </div>
            <Button
              onClick={loadAttendance}
              variant="outline"
              className="rounded-xl h-10 px-4 text-xs font-black uppercase tracking-widest gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Selected Date</p>
            <div className="mt-2 relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 pl-10 pr-3 text-sm font-semibold"
              />
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Range From</p>
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="mt-2 w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold"
            />
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Range To</p>
            <input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="mt-2 w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-sm font-semibold"
            />
          </div>
        </section>

        {error ? (
          <QueryErrorState title="Attendance unavailable" description={error} onRetry={loadAttendance} />
        ) : null}

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Team Members</p>
            <p className="mt-2 text-2xl font-black text-foreground">{visibleUsers.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Your Present Days</p>
            <p className="mt-2 text-2xl font-black text-primary">{mySummary?.presentDays ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Your Attendance %</p>
            <p className="mt-2 text-2xl font-black text-foreground">{mySummary?.attendancePercent ?? 0}%</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-white p-5 md:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Daily Attendance Control</h2>
          </div>

          {isLoading ? (
            <div className="py-8 text-sm text-muted-foreground">Loading attendance records...</div>
          ) : visibleUsers.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">No attendance users found for the selected range.</div>
          ) : (
            <div className="space-y-3">
              {visibleUsers.map((u) => {
                const record = u.records.find((r) => r.date === selectedDate);
                const alreadySubmitted = !isAdmin && Boolean(record?.status);
                const draft = draftStatusByUserId[u.userId] || record?.status || 'PRESENT';
                const isSaving = Boolean(savingByUserId[u.userId]);

                return (
                  <div key={u.userId} className="rounded-2xl border border-border bg-muted/10 p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-foreground">{u.name}</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                          {u.role}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-lg font-black text-primary">{u.attendancePercent}%</p>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                          {u.presentDays}/{u.markedDays || 0} present days
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                      <Button
                        type="button"
                        variant={draft === 'PRESENT' ? 'default' : 'outline'}
                        className={cn(
                          'rounded-xl h-10 font-black uppercase tracking-widest text-xs gap-2',
                          draft === 'PRESENT' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''
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
                          draft === 'ABSENT' ? 'bg-primary hover:bg-primary/90 text-primary-foreground' : ''
                        )}
                        disabled={alreadySubmitted || isSaving}
                        onClick={() => handleSelectStatus(u.userId, 'ABSENT')}
                      >
                        <UserX className="w-4 h-4" /> Absent
                      </Button>

                      {isAdmin ? (
                        <Button
                          type="button"
                          className="rounded-xl h-10 px-5 font-black uppercase tracking-widest text-xs gap-2"
                          disabled={isSaving}
                          onClick={() => handleAdminSave(u.userId)}
                        >
                          <Save className="w-4 h-4" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="rounded-xl h-10 px-5 font-black uppercase tracking-widest text-xs gap-2"
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
