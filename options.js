import { DEFAULTS } from './settings.js';

const $ = id => document.getElementById(id);
const s = await chrome.storage.local.get(DEFAULTS);
$('gmail').checked = s.gmail;
$('gmailUser').value = s.gmailUser;
$('gmailLabel').value = s.gmailLabel;
$('naverId').value = s.naverId;
$('naverFolder').value = s.naverFolder;

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  await chrome.storage.local.set({
    gmail: $('gmail').checked,
    gmailUser: Number($('gmailUser').value) || 0,
    gmailLabel: $('gmailLabel').value.trim(),
    naverId: $('naverId').value.trim(),
    naverFolder: $('naverFolder').value.trim(),
  });
  $('status').textContent = '저장됨';
  setTimeout(() => ($('status').textContent = ''), 1500);
});
