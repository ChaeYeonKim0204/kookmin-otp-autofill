// Runs only on https://portal.kookmin.ac.kr/por/otp* (see manifest).
// Asks for the OTP every 3s for 60s, fills it (replacing it if a newer one arrives), never submits.
const TRIES = 20;
const INTERVAL_MS = 3000;
const openedAt = Date.now(); // only mails received after this (minus slack) count

function findInput() {
  const visible = [...document.querySelectorAll('input[type=text], input[type=tel], input[type=number], input:not([type])')]
    .filter(el => el.offsetParent && !el.disabled && !el.readOnly);
  return document.getElementById('postPorOtpVal') // Kookmin portal OTP field
    ?? document.querySelector('input[autocomplete="one-time-code"]')
    ?? visible.find(el => /otp|auth|cert|code|인증/i.test(`${el.name} ${el.id} ${el.placeholder}`))
    ?? (visible.length === 1 ? visible[0] : null);
}

function fill(input, code) {
  // Native setter so framework-controlled inputs (React etc.) see the change.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, code);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
}

// Debug logs never include the code itself.
const log = (...a) => console.log('[OTP autofill]', ...a);

(async () => {
  log('started on', location.origin + location.pathname);
  let filled = null;
  for (let i = 0; i < TRIES; i++) {
    const input = findInput();
    // Stop if the user typed something themselves.
    if (input?.value && input.value !== filled) return log('input has a user-entered value, stopping');
    if (!input) log(`try ${i + 1}: OTP input not found`);
    else {
      // Keep watching after filling: if a newer OTP mail arrives (e.g. the page re-sent it),
      // replace the value, since only the latest code is valid.
      const code = await chrome.runtime.sendMessage({ type: 'otp', since: openedAt });
      if (code && code !== filled) {
        fill(input, code);
        log(filled ? 'replaced with newer OTP' : 'filled');
        filled = code;
      } else if (!code) log(`try ${i + 1}: no fresh OTP mail yet`);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  log('stopped after', (TRIES * INTERVAL_MS) / 1000, 's');
})();
