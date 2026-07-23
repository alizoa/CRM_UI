export function formatRelativeTime(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return '';
  }

  const diffMs = Date.now() - timestamp;
  const seconds = Math.max(0, Math.floor(diffMs / 1000));

  if (seconds < 60) {
    return 'Just now';
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  if (hours < 48) {
    return 'Yesterday';
  }

  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
