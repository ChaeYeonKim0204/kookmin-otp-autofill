// Reads only the newest OTP mail subjects, only when the OTP page asks.
// The browser attaches the mail session cookies; this code never sees them.
import { DEFAULTS } from './settings.js';

// Gmail: Atom feed of one label. u/N = Nth signed-in Google account.
const gmailFeed = (user, label) =>
  `https://mail.google.com/mail/u/${Number(user) || 0}/feed/atom/${encodeURIComponent(label)}`;
// Naver (POST form, like the mail web app): mailbox list (name -> folderSN), and unread mails in `folderSN`.
const naverFolders = id => ['https://mail.naver.com/json/folder/list', { vipMailBox: 'true', u: id }];
const naverList = (id, folderSN) => ['https://mail.naver.com/json/list', {
  folderSN, page: 1, viewMode: 'time', previewMode: 1, sortField: 1, sortType: 0, isUnread: 'true', u: id,
}];

const MAX_AGE_MS = 3 * 60 * 1000;
// Mail may land slightly before the OTP page finishes loading, and clocks drift a little.
const SINCE_SLACK_MS = 20 * 1000;
const OTP_RE = /\[ON\s*국민포털\]\s*인증번호\D{0,10}?(\d{6})(?!\d)/; // e.g. '[ON국민포털] 인증번호 안내 123456'

// mails: [{ subject, time (ms) }]. Looks at the newest 2 only; ignores anything older than MAX_AGE_MS
// or received before the OTP page opened (`since`), so a leftover OTP from an earlier attempt isn't used.
function pick(mails, now, since = 0) {
  for (const { subject, time } of mails.sort((a, b) => b.time - a.time).slice(0, 2)) {
    if (!(now - time < MAX_AGE_MS) || time < since - SINCE_SLACK_MS) continue;
    const m = subject.match(OTP_RE);
    if (m) return m[1];
  }
  return null;
}

const tag = (s, name) => s.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '';

const gmailMails = xml => [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
  .map(([, e]) => ({ subject: tag(e, 'title'), time: Date.parse(tag(e, 'issued')) }));
const naverMails = json => (Array.isArray(json?.mailData) ? json.mailData : [])
  .map(m => ({ subject: String(m.subject ?? ''), time: Number(m.receivedTime) * 1000 }));

export const gmailOtp = (xml, since, now = Date.now()) => pick(gmailMails(xml), now, since);
export const naverOtp = (json, since, now = Date.now()) => pick(naverMails(json), now, since);

// Debug summary without mail contents: count, and age + subject-match of the newest 2.
const describe = mails => `${mails.length} unread; newest: ${JSON.stringify(
  [...mails].sort((a, b) => b.time - a.time).slice(0, 2)
    .map(m => ({ ageSec: Math.round((Date.now() - m.time) / 1000), otpSubject: OTP_RE.test(m.subject) })))}`;
const log = (...a) => console.log('[OTP autofill]', ...a);

export const naverFolderSN = (json, name) =>
  (Array.isArray(json?.folderList) ? json.folderList : []).find(f => f.folderName === name)?.folderSN ?? null;

export function isOtpPage(url) {
  try {
    const u = new URL(url);
    return u.origin === 'https://portal.kookmin.ac.kr' && u.pathname.startsWith('/por/otp');
  } catch {
    return false;
  }
}

const get = url => fetch(url, { credentials: 'include', cache: 'no-store' })
  .then(r => { if (!r.ok) throw new Error(r.status); return r; });

const postJson = async ([url, params]) => {
  // Params in the body only: duplicating them in the query string makes the server see e.g. folderSN=101,101.
  const r = await fetch(url, { method: 'POST', body: new URLSearchParams(params), credentials: 'include', cache: 'no-store' });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url} -> HTTP ${r.status}, ${r.headers.get('content-type')}, ${text.length} bytes, redirected=${r.redirected}`);
  }
};

// Cached per service-worker lifetime so polling doesn't refetch the folder list every 3s.
let folderCache = { key: null, sn: null };
async function naverLookup(id, name, since) {
  const key = `${id}\n${name}`;
  if (folderCache.key !== key) {
    const sn = naverFolderSN(await postJson(naverFolders(id)), name);
    if (sn === null) throw new Error(`Naver mailbox not found: ${name}`);
    folderCache = { key, sn };
    log(`naver mailbox "${name}" = folderSN ${sn}`);
  }
  const json = await postJson(naverList(id, folderCache.sn));
  if (!Array.isArray(json?.mailData)) {
    log('naver: no mailData in response; keys =', Object.keys(json ?? {}), 'Result =', json?.Result, 'Message =', json?.Message);
  }
  log('naver:', describe(naverMails(json)));
  return naverOtp(json, since);
}

async function lookup(since) {
  const s = await chrome.storage.local.get(DEFAULTS);
  const tries = [];
  if (s.gmail) tries.push(['gmail', get(gmailFeed(s.gmailUser, s.gmailLabel)).then(r => r.text())
    .then(xml => (log('gmail:', describe(gmailMails(xml))), gmailOtp(xml, since)))]);
  if (s.naverId) tries.push(['naver', naverLookup(s.naverId, s.naverFolder, since)]);
  if (!tries.length) console.warn('[OTP autofill] no mail provider configured');
  // Debug logs never include the code or mail contents.
  const codes = await Promise.all(tries.map(([name, p]) => p
    .then(code => (console.log(`[OTP autofill] ${name}:`, code ? 'found' : 'no fresh OTP'), code))
    .catch(e => (console.warn(`[OTP autofill] ${name} failed:`, e.message), null))));
  return codes.find(Boolean) ?? null;
}

globalThis.chrome?.runtime?.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'otp' || !Number.isFinite(msg.since)) return;
  if (!isOtpPage(sender.url)) return log('ignored request from', sender.origin);
  lookup(msg.since).then(sendResponse);
  return true;
});

globalThis.chrome?.runtime?.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
