/**
 * Totally Tabular mailing list (Google Apps Script, runs inside your Google Workspace).
 *
 * The site's Subscribe form saves each address straight to Firestore (the "signups" collection in the Google Cloud
 * project FIRESTORE_PROJECT; its rules are in firestore/), which answers in a fraction of a second, then nudges this
 * web app. processSignups() moves every waiting signup into the "Subscribers" tab of the Sheet this script is attached
 * to, one row per address (timestamp | email | source | confirmation sent), and deletes it from Firestore. It also runs
 * every minute (installTrigger), so a lost nudge only delays the confirmation email.
 *
 * Each new subscriber gets one confirmation email from this account. "confirmation sent" records when; a blank cell
 * means the send failed, and signing up again retries it. At most MAX_CONFIRMATIONS_PER_DAY go out per day, so a flood
 * of fake signups can't use this account to email strangers.
 *
 * Deployed from this folder with clasp (see README, "Mailing list"). appsscript.json holds the web app settings: it
 * runs as the account that deployed it (community@totallytabular.org) and anyone can call it. It can only touch the
 * spreadsheet it is attached to, read and delete Firestore data, and send email as that account.
 *
 * After any code change, push and update the existing deployment: the /exec URL only serves the deployed version.
 */

var TAB = 'Subscribers';
var HEADER = ['timestamp', 'email', 'source', 'confirmation sent'];
var MAX_CONFIRMATIONS_PER_DAY = 200;
var DISCORD = 'https://discord.gg/H87gfV5Eku';
var FIRESTORE_PROJECT = 'totallytabular-mailing-list';
var INBOX = 'https://firestore.googleapis.com/v1/projects/' + FIRESTORE_PROJECT + '/databases/(default)/documents/signups';

// The site's nudge after it saved a signup to Firestore.
function doPost(e) {
  try {
    // TEMP: a body with an email is a direct signup from a cached copy of the old page. Remove once those have expired.
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    if (body.email) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try { addSubscriber(subscribersTab(SpreadsheetApp.getActiveSpreadsheet()), body.email, body.source); } finally { lock.releaseLock(); }
      return json({ ok: true });
    }
    return json({ ok: true, processed: processSignups() });
  } catch (err) {
    console.error(err); // shows up under Executions in the Apps Script editor
    return json({ ok: false, error: 'server_error' });
  }
}

// A GET in the browser is a quick health check that the deployment is alive.
function doGet() {
  return json({ ok: true, service: 'totally-tabular-subscribe' });
}

// Moves every signup waiting in Firestore into the Sheet; returns how many it handled. A signup is deleted from
// Firestore only after its row is written, so a failure leaves it for the next run.
function processSignups() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0; // another run still holds the lock; the next one picks these up
  try {
    var docs = JSON.parse(firestore('get', INBOX + '?pageSize=100').getContentText()).documents || [];
    if (!docs.length) return 0;
    var sheet = subscribersTab(SpreadsheetApp.getActiveSpreadsheet());
    docs.forEach(function (doc) {
      addSubscriber(sheet, ((doc.fields || {}).email || {}).stringValue, 'site');
      firestore('delete', 'https://firestore.googleapis.com/v1/' + doc.name);
    });
    return docs.length;
  } finally {
    lock.releaseLock();
  }
}

// One row per address, plus the confirmation email. Invalid addresses are dropped.
function addSubscriber(sheet, email, source) {
  email = String(email || '').trim().toLowerCase();
  // appendRow stores anything starting with = as a live formula (and + - act the same in Excel after a CSV export): refuse those.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || /^[=+\-]/.test(email)) return;
  var last = sheet.getLastRow();
  var rows = last > 1 ? sheet.getRange(2, 2, last - 1, 3).getValues() : []; // email, source, confirmation sent
  var i = rows.map(function (r) { return String(r[0]).toLowerCase(); }).indexOf(email);
  var row = i + 2;
  if (i === -1) {
    sheet.appendRow([new Date(), email, String(source || 'site').replace(/[^\w.-]/g, '').slice(0, 100)]);
    row = sheet.getLastRow();
  }
  var today = new Date().toDateString();
  var sentToday = rows.filter(function (r) { return r[2] instanceof Date && r[2].toDateString() === today; }).length;
  if ((i === -1 || !rows[i][2]) && sentToday < MAX_CONFIRMATIONS_PER_DAY) {
    try {
      sendConfirmation(email);
      sheet.getRange(row, 4).setValue(new Date());
    } catch (err) {
      console.error(err); // cell stays blank, so signing up again retries; retrying every minute could loop forever
    }
  }
}

// Firestore REST call as this account. X-Goog-User-Project bills it to the Firestore project, where the API is turned on
// (the script's own hidden Cloud project has no Firestore).
function firestore(method, url) {
  var res = UrlFetchApp.fetch(url, {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIRESTORE_PROJECT }
  });
  if (res.getResponseCode() >= 300) throw new Error('firestore ' + method + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return res;
}

// Run once from the Apps Script editor (choose installTrigger, then Run): Google asks you to authorize the script, then
// processSignups runs every minute as a backstop for the site's nudge. Safe to run again.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processSignups').timeBased().everyMinutes(1).create();
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
