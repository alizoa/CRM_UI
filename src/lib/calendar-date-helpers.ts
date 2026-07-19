export function getLocalDayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number) {
  const nextDate = getLocalDayStart(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function getLocalWeekStart(date: Date) {
  return addLocalDays(date, -date.getDay());
}

export function getLocalWeekDays(date: Date) {
  const weekStart = getLocalWeekStart(date);

  return Array.from({ length: 7 }, (_, index) => addLocalDays(weekStart, index));
}

export function getLocalDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatWeekRangeLabel(date: Date) {
  const weekDays = getLocalWeekDays(date);
  const start = weekDays[0];
  const end = weekDays[6];
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth) {
    return `${new Intl.DateTimeFormat(undefined, { month: 'short' }).format(start)} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
  }

  if (sameYear) {
    const startLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start);
    const endLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(end);
    return `${startLabel}-${endLabel}, ${end.getFullYear()}`;
  }

  const startLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(start);
  const endLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(end);
  return `${startLabel}-${endLabel}`;
}
