/**
 * Totally Tabular mailing list capture (Google Apps Script, runs inside your Google Workspace).
 *
 * Setup, as community@totallytabular.org:
 *   1. Create a Google Sheet named "Mailing list". Rename the first tab to "Subscribers" and put these
 *      headers in row 1:  timestamp | email | source
 *   2. In that Sheet: Extensions -> Apps Script. Delete the sample code, paste this file, save.
 *   3. Deploy -> New deployment -> type "Web app".
 *        Execute as: Me (community@totallytabular.org)
 *        Who has access: Anyone
 *      Authorize when asked, then copy the Web app URL (it ends in /exec).
 *   4. In index.html, set  var SUBSCRIBE_ENDPOINT = '<that URL>';  and redeploy the site.
 *   5. Test: submit the form on the live site and watch a row appear in the Sheet.
 *
 * After any code change here you must create a NEW deployment (or "Manage deployments" -> edit -> new version);
 * the /exec URL only serves the deployed version.
 */

var TAB = 'Subscribers';

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    var email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, error: 'invalid_email' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB);
      if (!sheet) throw new Error('missing tab ' + TAB);
      var last = sheet.getLastRow();
      var existing = last > 1 ? sheet.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return String(r[0]).toLowerCase(); }) : [];
      if (existing.indexOf(email) === -1) {
        sheet.appendRow([new Date(), email, String(body.source || 'site').slice(0, 100)]);
      }
    } finally {
      lock.releaseLock();
    }
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: 'server_error' });
  }
}

// A GET in the browser is a quick health check that the deployment is alive.
function doGet() {
  return json({ ok: true, service: 'totally-tabular-subscribe' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
