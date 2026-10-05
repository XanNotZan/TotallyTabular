/**
 * Totally Tabular mailing list capture (Google Apps Script, runs inside your Google Workspace).
 *
 * Signups land in the "Subscribers" tab of the Sheet this script is attached to, one row per address
 * (timestamp | email | source | confirmation sent). The first signup creates the tab and its header row.
 *
 * Each new subscriber gets one confirmation email from this account. "confirmation sent" records when; a blank cell
 * means the send failed, and signing up again retries it. At most MAX_CONFIRMATIONS_PER_DAY go out per day, so a flood
 * of fake signups can't use this account to email strangers.
 *
 * Deployed from this folder with clasp (see README, "Mailing list"). appsscript.json holds the web app settings: it
 * runs as the account that deployed it (community@totallytabular.org), anyone can call it, and it can only touch the
 * spreadsheet it is attached to and send email as that account.
 *
 * After any code change, push and update the existing deployment: the /exec URL only serves the deployed version.
 */

var TAB = 'Subscribers';
var HEADER = ['timestamp', 'email', 'source', 'confirmation sent'];
var MAX_CONFIRMATIONS_PER_DAY = 200;
var DISCORD = 'https://discord.gg/H87gfV5Eku';

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    var email = String(body.email || '').trim().toLowerCase();
    // appendRow stores anything starting with = as a live formula (and + - act the same in Excel after a CSV export): refuse those.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || /^[=+\-]/.test(email)) return json({ ok: false, error: 'invalid_email' });

    // The site doesn't wait for this answer, so the lock and the full read cost visitors nothing.
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = subscribersTab(SpreadsheetApp.getActiveSpreadsheet());
      var last = sheet.getLastRow();
      var rows = last > 1 ? sheet.getRange(2, 2, last - 1, 3).getValues() : []; // email, source, confirmation sent
      var i = rows.map(function (r) { return String(r[0]).toLowerCase(); }).indexOf(email);
      var row = i + 2;
      if (i === -1) {
        sheet.appendRow([new Date(), email, String(body.source || 'site').replace(/[^\w.-]/g, '').slice(0, 100)]);
        row = sheet.getLastRow();
      }
      var today = new Date().toDateString();
      var sentToday = rows.filter(function (r) { return r[2] instanceof Date && r[2].toDateString() === today; }).length;
      if ((i === -1 || !rows[i][2]) && sentToday < MAX_CONFIRMATIONS_PER_DAY) {
        sendConfirmation(email);
        sheet.getRange(row, 4).setValue(new Date()); // only after the send succeeded, so a failure is retried next signup
      }
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    console.error(err); // shows up under Executions in the Apps Script editor
    return json({ ok: false, error: 'server_error' });
  }
}

// A GET in the browser is a quick health check that the deployment is alive.
function doGet() {
  return json({ ok: true, service: 'totally-tabular-subscribe' });
}

function sendConfirmation(email) {
  MailApp.sendEmail({
    to: email,
    name: 'Totally Tabular',
    subject: "You're subscribed to Totally Tabular",
    body: [
      'Thanks for subscribing to Totally Tabular!',
      '',
      "We'll send articles, project news, and event announcements to this address.",
      '',
      'In the meantime, come say hello on Discord: ' + DISCORD,
      '',
      "Didn't sign up? Reply to this email and we'll take you off the list.",
      '',
      'Totally Tabular',
      'https://totallytabular.org'
    ].join('\n')
  });
}

// The Subscribers tab. A new spreadsheet's blank first tab is reused (a tab that already holds data is never renamed),
// and the header row is written whenever its last column is blank: on a new tab, or after a column is added here.
function subscribersTab(ss) {
  var sheet = ss.getSheetByName(TAB);
  if (!sheet) {
    var first = ss.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(TAB) : ss.insertSheet(TAB);
  }
  if (sheet.getRange(1, HEADER.length).isBlank()) sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
