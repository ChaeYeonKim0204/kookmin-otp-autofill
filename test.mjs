// node test.mjs
import assert from 'node:assert/strict';
import { gmailOtp as findOtp, naverOtp, naverFolderSN, isOtpPage } from './background.js';

const now = Date.parse('2026-10-01T06:50:00Z');
const entry = (issued, title, summary) =>
  `<entry><title>${title}</title><summary>${summary}</summary><issued>${issued}</issued></entry>`;
const feed = (...e) => `<feed>${e.join('')}</feed>`;

assert.equal(findOtp(feed(entry('2026-10-01T06:49:30Z', '[ON 국민포털] 인증번호 482913', '')), 0, now), '482913');
assert.equal(findOtp(feed(entry('2026-10-01T06:40:00Z', '[ON 국민포털] 인증번호 482913', '')), 0, now), null, 'too old');
assert.equal(findOtp(feed(entry('2026-10-01T06:49:00Z', 'hi', '[ON 국민포털] 인증번호 123456')), 0, now), null, 'code only in body is ignored');
assert.equal(findOtp(feed(
  entry('2026-10-01T06:49:50Z', 'a', 'x'),
  entry('2026-10-01T06:49:40Z', 'b', 'x'),
  entry('2026-10-01T06:49:30Z', '[ON 국민포털] 인증번호 111111', ''),
), 0, now), null, 'only newest 2 entries are read');
assert.equal(findOtp('<html>login page</html>', 0, now), null);
assert.equal(findOtp(feed(entry('2026-10-01T06:49:30Z', '[ON국민포털] 인증번호 안내 482913', '')), 0, now), '482913', 'real subject format');
assert.equal(findOtp(feed(entry('2026-10-01T06:49:30Z', '[ON 국민포털] 인증번호: 482913', '')), 0, now), '482913');
assert.equal(findOtp(feed(entry('2026-10-01T06:49:30Z', '[ON국민포털] 인증번호 안내 4829131', '')), 0, now), null, '7 digits is not an OTP');

const sec = iso => Date.parse(iso) / 1000;
assert.equal(naverOtp({ mailData: [
  { subject: '광고', receivedTime: sec('2026-10-01T06:49:55Z') },
  { subject: '[ON 국민포털] 인증번호 654321', receivedTime: sec('2026-10-01T06:49:40Z') },
] }, 0, now), '654321');
assert.equal(naverOtp({ mailData: [{ subject: '[ON 국민포털] 인증번호 654321', receivedTime: sec('2026-10-01T06:40:00Z') }] }, 0, now), null, 'too old');
assert.equal(naverOtp({ mailData: [
  { subject: 'a', receivedTime: sec('2026-10-01T06:49:30Z') },
  { subject: '[ON 국민포털] 인증번호 111111', receivedTime: sec('2026-10-01T06:49:10Z') },
  { subject: 'b', receivedTime: sec('2026-10-01T06:49:50Z') },
] }, 0, now), null, 'only newest 2 by time');
assert.equal(naverOtp({ mailData: [
  { subject: '[ON 국민포털] 인증번호 111111', receivedTime: sec('2026-10-01T06:48:00Z') },
  { subject: '[ON 국민포털] 인증번호 222222', receivedTime: sec('2026-10-01T06:49:00Z') },
] }, 0, now), '222222', 'two fresh OTPs: newest wins');
assert.equal(naverOtp(null, 0, now), null);
const opened = Date.parse('2026-10-01T06:49:00Z');
const leftover = { subject: '[ON국민포털] 인증번호 안내 111111', receivedTime: sec('2026-10-01T06:48:00Z') };
assert.equal(naverOtp({ mailData: [leftover] }, opened, now), null, 'OTP from before the page opened is ignored');
assert.equal(naverOtp({ mailData: [leftover, { subject: '[ON국민포털] 인증번호 안내 222222', receivedTime: sec('2026-10-01T06:49:20Z') }] }, opened, now), '222222');
assert.equal(naverOtp({ mailData: [{ subject: '[ON국민포털] 인증번호 안내 333333', receivedTime: sec('2026-10-01T06:48:50Z') }] }, opened, now), '333333', 'within 20s slack');
assert.equal(naverOtp({ mailData: 'x' }, 0, now), null);

const folders = { folderList: [{ folderName: '받은메일함', folderSN: 0 }, { folderName: 'otp', folderSN: 101 }] };
assert.equal(naverFolderSN(folders, 'otp'), 101);
assert.equal(naverFolderSN(folders, '받은메일함'), 0);
assert.equal(naverFolderSN(folders, 'nope'), null);
assert.equal(naverFolderSN(null, 'otp'), null);

assert.ok(isOtpPage('https://portal.kookmin.ac.kr/por/otp'));
assert.ok(isOtpPage('https://portal.kookmin.ac.kr/por/otp?x=1'));
assert.ok(!isOtpPage('https://portal.kookmin.ac.kr.evil.com/por/otp'));
assert.ok(!isOtpPage('http://portal.kookmin.ac.kr/por/otp'));
assert.ok(!isOtpPage('https://portal.kookmin.ac.kr/por/main'));
assert.ok(!isOtpPage(undefined));
console.log('ok');
