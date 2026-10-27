// Calendar (.ics) files. A web app cannot send notifications while it is closed without a server,
// so reminders are delivered by the iPhone Calendar instead: open the file, tap "Add All", done.
// Times are "floating" (no time zone) so they always land at the local wall-clock time.
import { pad } from './util.js';

const stamp = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;

const utcStamp = (date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

const text = (value) => String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 bytes as the spec requires. */
function fold(line) {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = ' ' + rest.slice(74); }
  out.push(rest);
  return out.join('\r\n');
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * event: { uid, summary, start: Date, minutes?, weekdays?: number[], repeat?: 'DAILY'|'WEEKLY',
 *          alarmsBefore?: number[] (minutes), sequence?: number }
 */
function vevent(event, now) {
  const end = new Date(event.start.getTime() + (event.minutes ?? 15) * 60000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${event.uid}@newroute.app`,
    `DTSTAMP:${utcStamp(now)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(event.summary)}`
  ];
  if (event.repeat === 'DAILY') lines.push('RRULE:FREQ=DAILY');
  if (event.repeat === 'WEEKLY') {
    const days = event.weekdays?.length ? `;BYDAY=${event.weekdays.map((d) => ICS_DAYS[d]).join(',')}` : '';
    lines.push(`RRULE:FREQ=WEEKLY${days}`);
  }
  for (const minutes of event.alarmsBefore ?? [0]) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${text(event.summary)}`,
      minutes === 0 ? 'TRIGGER:PT0S' : `TRIGGER:-PT${minutes}M`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

export function buildCalendar(events, name = 'New Route') {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//New Route//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${text(name)}`
  ];
  events.forEach((event) => lines.push(...vevent(event, now)));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** First start date for a repeating event: today at the given time, or the next matching weekday. */
export function nextOccurrence(minutes, weekday = null) {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  while (weekday !== null && date.getDay() !== weekday) date.setDate(date.getDate() + 1);
  return date;
}
