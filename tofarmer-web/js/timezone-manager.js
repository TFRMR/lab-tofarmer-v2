// ========================================
// TIMEZONE UTILITIES
// ========================================
// Fix: Chat sore tampil pagi (timezone mismatch)
// Solution: Convert UTC to local timezone correctly
// ========================================

class TimezoneManager {
  constructor() {
    this.userTimezone = this.detectTimezone();
    console.log('🕐 Timezone detected:', this.userTimezone);
  }

  /**
   * Detect user timezone (from browser)
   */
  detectTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
      return 'Asia/Jakarta'; // Default untuk Indonesia
    }
  }

  /**
   * Get timezone offset (in hours)
   * Positive = East of UTC, Negative = West of UTC
   */
  getTimezoneOffset() {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: this.userTimezone }));
    const offsetMs = tzDate - utcDate;
    const offsetHours = offsetMs / (1000 * 60 * 60);
    return offsetHours;
  }

  /**
   * Format timestamp untuk display
   * Input: ISO string dari Supabase (UTC)
   * Output: Formatted string dengan timezone lokal
   */
  formatTimestamp(isoString) {
    try {
      const date = new Date(isoString);

      // Option 1: Time only (HH:MM)
      const timeStr = date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: this.userTimezone,
        hour12: false
      });

      return timeStr;  // "14:30"
    } catch (error) {
      console.error('❌ Timestamp format error:', error);
      return 'Invalid';
    }
  }

  /**
   * Format timestamp dengan date + time
   */
  formatTimestampFull(isoString) {
    try {
      const date = new Date(isoString);

      // Format: "25 Jul 14:30"
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

      return `${fullStr} ${timeStr}`;  // "25 Jul 24 14:30"
    } catch (error) {
      console.error('❌ Full timestamp format error:', error);
      return 'Invalid';
    }
  }

  /**
   * Format relative time ("2 menit lalu", "1 jam lalu", etc)
   */
  formatRelativeTime(isoString) {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffSeconds < 60) {
        return 'Baru saja';
      } else if (diffMinutes < 60) {
        return `${diffMinutes} menit lalu`;
      } else if (diffHours < 24) {
        return `${diffHours} jam lalu`;
      } else if (diffDays === 1) {
        return 'Kemarin';
      } else if (diffDays < 7) {
        return `${diffDays} hari lalu`;
      } else {
        // Fallback to date format
        return this.formatTimestampFull(isoString);
      }
    } catch (error) {
      console.error('❌ Relative time error:', error);
      return 'Invalid';
    }
  }

  /**
   * Check if date is today/yesterday/etc
   */
  isToday(isoString) {
    const date = new Date(isoString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  /**
   * Get time category (pagi/siang/sore/malam)
   */
  getTimeCategory(isoString) {
    const date = new Date(isoString);
    const hour = date.getHours();

    if (hour >= 5 && hour < 12) return '🌅 Pagi';
    if (hour >= 12 && hour < 15) return '☀️ Siang';
    if (hour >= 15 && hour < 18) return '🌤️ Sore';
    if (hour >= 18 && hour < 21) return '🌆 Malam';
    return '🌙 Tengah Malam';
  }

  /**
   * Convert UTC timestamp to local timezone
   * Used when storing/retrieving from Supabase
   */
  convertUTCToLocal(isoString) {
    try {
      const date = new Date(isoString);
      const offset = this.getTimezoneOffset();
      const localDate = new Date(date.getTime() + offset * 60 * 60 * 1000);
      return localDate;
    } catch (error) {
      console.error('❌ Convert error:', error);
      return new Date();
    }
  }

  /**
   * Create timestamp untuk insert ke database (always UTC)
   */
  createUTCTimestamp() {
    return new Date().toISOString();
  }
}

// ========================================
// USAGE IN CHAT
// ========================================

// Initialize (di init() function)
const tzManager = new TimezoneManager();

// ========================================
// UPDATE appendMessageUI FUNCTION
// ========================================

function appendMessageUI(msg) {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;

  const messageEl = document.createElement('div');
  messageEl.className = 'mb-3 p-2 rounded-lg bg-stone-900/30 border border-stone-800';

  // Format timestamp dengan timezone
  const timeStr = tzManager.formatTimestamp(msg.timestamp);
  const relativeTime = tzManager.formatRelativeTime(msg.timestamp);
  const timeCategory = tzManager.getTimeCategory(msg.timestamp);

  // Build message HTML
  messageEl.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="flex-1">
        <div class="text-xs font-semibold text-amber-400">${msg.sender}</div>
        <div class="text-sm text-stone-300 mt-1">${msg.content || '📸 Shared image'}</div>
        
        <!-- Add image if exists -->
        ${msg.image_url ? `<img src="${msg.image_url}" class="max-w-xs max-h-64 rounded-lg mt-2" alt="Image" />` : ''}
        ${msg.image_data ? `<img src="${msg.image_data}" class="max-w-xs max-h-64 rounded-lg mt-2" alt="Image" />` : ''}
      </div>
      <div class="text-right ml-2">
        <div class="text-xs text-stone-500" title="${tzManager.formatTimestampFull(msg.timestamp)}">
          ${timeStr}
        </div>
        <div class="text-xs text-stone-600">${tzManager.formatRelativeTime(msg.timestamp)}</div>
      </div>
    </div>
  `;

  messagesContainer.appendChild(messageEl);
  
  // Debug log
  console.log(`💬 Message appended: ${msg.sender} at ${timeStr} (${relativeTime})`);
}

// ========================================
// ALTERNATIVE: Show time category badges
// ========================================

function appendMessageUIWithCategory(msg) {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;

  const timeStr = tzManager.formatTimestamp(msg.timestamp);
  const timeCategory = tzManager.getTimeCategory(msg.timestamp);

  const messageEl = document.createElement('div');
  messageEl.className = 'mb-3 p-2 rounded-lg bg-stone-900/30 border border-stone-800';

  messageEl.innerHTML = `
    <div class="flex justify-between items-start">
      <div>
        <div class="flex gap-2 items-center">
          <span class="text-xs font-semibold text-amber-400">${msg.sender}</span>
          <span class="text-xs text-stone-500">${timeCategory}</span>
        </div>
        <div class="text-sm text-stone-300 mt-1">${msg.content}</div>
      </div>
      <div class="text-xs text-stone-500">${timeStr}</div>
    </div>
  `;

  messagesContainer.appendChild(messageEl);
}

// ========================================
// SETUP IN init() FUNCTION
// ========================================

/*
In init():

// Initialize timezone manager
const tzManager = new TimezoneManager();
console.log('✓ Timezone manager initialized');
console.log('  Timezone:', tzManager.userTimezone);
console.log('  Offset:', tzManager.getTimezoneOffset(), 'hours');

// Test
console.log('Test timestamps:');
console.log('  ISO:', new Date().toISOString());
console.log('  Local:', tzManager.formatTimestampFull(new Date().toISOString()));
console.log('  Relative:', tzManager.formatRelativeTime(new Date().toISOString()));

window.tzManager = tzManager;  // Expose for console testing
*/

// ========================================
// WHEN INSERTING MESSAGE
// ========================================

/*
// Use UTC timestamp untuk database
const msg = {
  sender: userAlias,
  content: message,
  channel: currentRoom,
  timestamp: tzManager.createUTCTimestamp(),  // Always UTC
  type: 'text'
};

insertMessage(msg);

// Display akan automatically convert ke local timezone
// via appendMessageUI() using tzManager.formatTimestamp()
*/

// ========================================
// FIXES EXPLAINED
// ========================================

/*
PROBLEM:
  User send message at 14:30 (sore)
  Database save: 07:30 UTC (difference = 7 hours, WIB)
  Display show: 07:30 (WRONG! should be 14:30)

CAUSE:
  JavaScript Date() auto-convert to UTC
  Display tidak re-convert ke local timezone

SOLUTION:
  1. Store: Always UTC (what we already do)
  2. Display: Convert UTC back to local timezone using Intl API
  3. Format: Show as "14:30" + "2 jam lalu"

IMPLEMENTATION:
  tzManager.formatTimestamp(isoString)
  → Detect user timezone
  → Convert UTC to local
  → Format & display

TIMEZONE DETECTION:
  Intl.DateTimeFormat().resolvedOptions().timeZone
  → Auto-detect from browser
  → Fallback: 'Asia/Jakarta' for Indonesia
*/

// ========================================
// EXPORT
// ========================================
window.TimezoneManager = TimezoneManager;