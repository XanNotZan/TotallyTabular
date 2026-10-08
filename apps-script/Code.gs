/**
 * Totally Tabular mailing list (Google Apps Script, runs inside your Google Workspace).
 *
 * The site saves each signup, and each request from its unsubscribe page, straight to Firestore (the "signups" and
 * "unsubscribes" collections in the Google Cloud project FIRESTORE_PROJECT; rules in firestore/), which answers in a
 * fraction of a second, then nudges this web app. processInbox() moves each signup into the "Subscribers" tab of the
 * Sheet this script is attached to, one row per address (timestamp | email | source | confirmation sent | unsubscribe
 * token), carries out each unsubscribe request, and deletes both from Firestore. It also runs every minute
 * (installTrigger), so a lost nudge only delays things.
 *
 * Each new subscriber gets one confirmation email from this account. "confirmation sent" records when; a blank cell
 * means the send failed, and signing up again retries it. At most MAX_CONFIRMATIONS_PER_DAY go out per day, so a flood
 * of fake signups can't use this account to email strangers.
 *
 * Unsubscribing deletes the row. Emails carry List-Unsubscribe headers, which give mail apps their own Unsubscribe button
 * (RFC 8058 one-click: a POST straight to this web app), and a visible link to the site's unsubscribe page, which asks
 * first. A GET never unsubscribes, because spam filters open links to scan them.
 *
 * Deployed from this folder with clasp (see README, "Mailing list"). appsscript.json holds the web app settings: it
 * runs as the account that deployed it (community@totallytabular.org) and anyone can call it. It can only touch the
 * spreadsheet it is attached to, read and delete Firestore data, and send email as that account.
 *
 * After any code change, push and update the existing deployment: the /exec URL only serves the deployed version.
 */

var TAB = 'Subscribers';
var HEADER = ['timestamp', 'email', 'source', 'confirmation sent', 'unsubscribe token'];
var MAX_CONFIRMATIONS_PER_DAY = 200;
var FROM = 'community@totallytabular.org';
var SITE = 'https://totallytabular.org';
var DISCORD = 'https://discord.gg/H87gfV5Eku';
var FIRESTORE_PROJECT = 'totallytabular-mailing-list';
var FIRESTORE = 'https://firestore.googleapis.com/v1/projects/' + FIRESTORE_PROJECT + '/databases/(default)/documents/';
// This deployment's own URL, for the List-Unsubscribe header. Not ScriptApp.getService().getUrl(): on Workspace that can
// return the /a/macros/<domain>/ form, which asks outsiders to sign in.
var EXEC_URL = 'https://script.google.com/macros/s/AKfycbxDSJLAvqmQ3S8f6_hktM9La-kYMfqKXfX7Kzo70Inww_razzLzCSHA0BqfqBbeQ8XD/exec';
var TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A mail app's one-click Unsubscribe (token in the URL, "List-Unsubscribe=One-Click" in the body), otherwise the site's
// nudge after it saved something to Firestore. Apps Script answers every POST with a 302 to the result, so a mail
// provider may log a non-200; the row is gone by then.
function doPost(e) {
  try {
    var token = e && e.parameter && e.parameter.unsubscribe;
    if (token) return json({ ok: unsubscribe(token) });
    return json({ ok: true, processed: processInbox() });
  } catch (err) {
    console.error(err); // shows up under Executions in the Apps Script editor
    return json({ ok: false, error: 'server_error' });
  }
}

// A GET in the browser is a quick health check that the deployment is alive. With ?unsubscribe= it is a browser that
// opened the List-Unsubscribe link: a GET must not unsubscribe (RFC 8058), so it links to the site's page, which asks first.
function doGet(e) {
  var token = e && e.parameter && e.parameter.unsubscribe;
  if (token && TOKEN.test(token)) {
    return HtmlService.createHtmlOutput('<p style="font:16px/1.5 sans-serif">To stop getting Totally Tabular emails, ' +
      '<a href="' + SITE + '/?unsubscribe=' + token + '" target="_top">continue to unsubscribe</a>.</p>').setTitle('Unsubscribe');
  }
  return json({ ok: true, service: 'totally-tabular-subscribe' });
}

// Carries out everything waiting in Firestore; returns how many requests it handled. Each is deleted from Firestore only
// after the Sheet is updated, so a failure leaves it for the next run.
function processInbox() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return 0; // another run still holds the lock; the next one picks these up
  try {
    var signups = list('signups'), unsubscribes = list('unsubscribes');
    if (!signups.length && !unsubscribes.length) return 0;
    var sheet = subscribersTab(SpreadsheetApp.getActiveSpreadsheet());
    signups.forEach(function (doc) {
      addSubscriber(sheet, field(doc, 'email'), 'site');
      google('delete', 'https://firestore.googleapis.com/v1/' + doc.name);
    });
    unsubscribes.forEach(function (doc) {
      removeSubscriber(sheet, field(doc, 'token'));
      google('delete', 'https://firestore.googleapis.com/v1/' + doc.name);
    });
    return signups.length + unsubscribes.length;
  } finally {
    lock.releaseLock();
  }
}

function list(collection) {
  return JSON.parse(google('get', FIRESTORE + collection + '?pageSize=100').getContentText()).documents || [];
}

function field(doc, name) {
  return ((doc.fields || {})[name] || {}).stringValue;
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
    sheet.appendRow([new Date(), email, String(source || 'site').replace(/[^\w.-]/g, '').slice(0, 100), '', Utilities.getUuid()]);
    row = sheet.getLastRow();
  }
  var today = new Date().toDateString();
  var sentToday = rows.filter(function (r) { return r[2] instanceof Date && r[2].toDateString() === today; }).length;
  if ((i === -1 || !rows[i][2]) && sentToday < MAX_CONFIRMATIONS_PER_DAY) {
    try {
      var cell = sheet.getRange(row, 5), token = cell.getValue();
      if (!token) cell.setValue(token = Utilities.getUuid()); // rows from before tokens existed
      sendConfirmation(email, token);
      sheet.getRange(row, 4).setValue(new Date());
    } catch (err) {
      console.error(err); // cell stays blank, so signing up again retries; retrying every minute could loop forever
    }
  }
}

// A mail app's one-click Unsubscribe. True once the address is off the list, including when it already was.
function unsubscribe(token) {
  if (!TOKEN.test(token)) return false;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    removeSubscriber(subscribersTab(SpreadsheetApp.getActiveSpreadsheet()), token);
    return true;
  } finally {
    lock.releaseLock();
  }
}

// Deletes the row holding this unsubscribe token, if there is one.
function removeSubscriber(sheet, token) {
  if (!TOKEN.test(String(token))) return;
  var last = sheet.getLastRow();
  var tokens = last > 1 ? sheet.getRange(2, 5, last - 1, 1).getValues().map(function (r) { return r[0]; }) : [];
  var i = tokens.indexOf(token);
  if (i !== -1) sheet.deleteRow(i + 2);
}

// Sent through the Gmail API because MailApp can't add the List-Unsubscribe headers. Keep every character ASCII: the
// parts declare no transfer encoding.
function sendConfirmation(email, token) {
  var page = SITE + '/?unsubscribe=' + token;
  var text = [
    'Thanks for subscribing to the Total Tabloid!',
    '',
    "We'll send articles, project news, and event announcements to this address.",
    '',
    'In the meantime, come say hello on Discord: ' + DISCORD,
    '',
    'Totally Tabular',
    SITE,
    '',
    "Didn't sign up, or changed your mind? Unsubscribe: " + page
  ].join('\r\n');
  var html = '<div style="font:16px/1.5 sans-serif;color:#0F1B26">' +
    '<p>Thanks for subscribing to the Total Tabloid!</p>' +
    "<p>We'll send articles, project news, and event announcements to this address.</p>" +
    '<p>In the meantime, come say hello on <a href="' + DISCORD + '">Discord</a>.</p>' +
    '<p style="font-size:13px;color:#4E5E6C">Totally Tabular &middot; <a href="' + SITE + '">totallytabular.org</a><br>' +
    "Didn't sign up, or changed your mind? <a href=\"" + page + '">Unsubscribe</a>.</p></div>';
  var b = 'tt-' + token;
  var mime = [
    'From: Totally Tabular <' + FROM + '>',
    'To: ' + email,
    "Subject: You're subscribed to Totally Tabular",
    'List-Unsubscribe: <' + EXEC_URL + '?unsubscribe=' + token + '>, <mailto:' + FROM + '?subject=unsubscribe>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + b + '"',
    '',
    '--' + b, 'Content-Type: text/plain; charset=UTF-8', '', text,
    '--' + b, 'Content-Type: text/html; charset=UTF-8', '', html,
    '--' + b + '--'
  ].join('\r\n');
  google('post', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw: Utilities.base64EncodeWebSafe(mime, Utilities.Charset.UTF_8) });
}

// Google API call as this account (Firestore, Gmail). X-Goog-User-Project bills it to FIRESTORE_PROJECT, where those
// APIs are turned on; the script's own hidden Cloud project has neither.
function google(method, url, payload) {
  var options = {
    method: method,
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': FIRESTORE_PROJECT }
  };
  if (payload) { options.contentType = 'application/json'; options.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() >= 300) throw new Error(method + ' ' + url.split('?')[0] + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  return res;
}

// Run once from the Apps Script editor (choose installTrigger, then Run): Google asks you to authorize the script, then
// processInbox runs every minute as a backstop for the site's nudge. Safe to run again.
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('processInbox').timeBased().everyMinutes(1).create();
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
