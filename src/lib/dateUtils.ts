export function formatSafeDate(dateInput: any, includeTime: boolean = false): string {
  if (!dateInput) return '—';
  try {
    let dateObj: Date;
    if (dateInput instanceof Date) {
      dateObj = dateInput;
    } else if (typeof dateInput === 'string') {
      // Handle Prisma ISO strings or simple date strings
      // If it's a simple YYYY-MM-DD without time, treat as local to avoid offset issues,
      // or just parse it.
      let parsed = new Date(dateInput);
      if (isNaN(parsed.getTime()) && !dateInput.endsWith('Z')) {
        parsed = new Date(dateInput + 'Z');
      }
      dateObj = parsed;
    } else if (typeof dateInput === 'number') {
      dateObj = new Date(dateInput);
    } else {
      return '—';
    }

    if (isNaN(dateObj.getTime())) {
      return 'Invalid Date';
    }

    if (includeTime) {
      return dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return 'Invalid Date';
  }
}
