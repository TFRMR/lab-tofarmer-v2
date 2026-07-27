// ========================================
// TIMEZONE UTILITIES
// ========================================

class TimezoneManager {
  constructor() {
    this.userTimezone = this.detectTimezone();
    console.log('🕐 Timezone detected:', this.userTimezone);
  }

  detectTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return 'Asia/Jakarta';
    }
  }

  getTimezoneOffset() {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: this.userTimezone }));
    return (tzDate - utcDate) / (1000 * 60 * 60);
  }

  formatTimestamp(isoString) {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: this.userTimezone,
        hour12: false
      });
    } catch (error) {
      return 'Invalid';
    }
  }

  formatTimestampFull(isoString) {
    try {
      const date = new Date(isoString);
      const fullStr = date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        timeZone: this.userTimezone
      });
      const timeStr = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: this.userTimezone,
        hour12: false
      });
      return `${fullStr} ${timeStr}`;
    } catch (error) {
      return 'Invalid';
    }
  }

  formatRelativeTime(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSeconds < 60) return 'Baru saja';
      if (diffMinutes < 60) return `${diffMinutes} menit lalu`;
      if (diffHours < 24) return `${diffHours} jam lalu`;
      if (diffDays === 1) return 'Kemarin';
      if (diffDays < 7) return `${diffDays} hari lalu`;
      return this.formatTimestampFull(isoString);
    } catch (error) {
      return 'Invalid';
    }
  }

  isToday(isoString) {
    const date = new Date(isoString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getTimeCategory(isoString) {
    const date = new Date(isoString);
    const hour = date.getHours();
    if (hour >= 5 && hour < 12) return '🌅 Pagi';
    if (hour >= 12 && hour < 15) return '☀️ Siang';
    if (hour >= 15 && hour < 18) return '🌤️ Sore';
    if (hour >= 18 && hour < 21) return '🌆 Malam';
    return '🌙 Tengah Malam';
  }

  createUTCTimestamp() {
    return new Date().toISOString();
  }
}

// Export kelas ke global window
window.TimezoneManager = TimezoneManager;