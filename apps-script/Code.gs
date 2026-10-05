/**
 * Totally Tabular mailing list capture (Google Apps Script, runs inside your Google Workspace).
 *
 * Signups land in the "Subscribers" tab of the Sheet this script is attached to. The first signup creates
 * that tab with its header row (timestamp | email | source), so there is nothing to set up by hand.
 *
 * Deployed from this folder with clasp (see README, "Mailing list"). appsscript.json holds the web app
 * settings: it runs as the account that deployed it (community@totallytabular.org), anyone can call it,
 * and it can only touch the spreadsheet it is attached to.
 *
 * After any code change, push and update the existing deployment: the /exec URL only serves the deployed version.
 */

var TAB = 'Subscribers';

function doPost(e) {
  try {
    var body = {};
    try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    var email = String(body.email || '').trim().toLowerCase();
    // appendRow stores anything starting with = as a live formula (and + - act the same in Excel after a CSV export): refuse those.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || /^[=+\-]/.test(email)) return json({ ok: false, error: 'invalid_email' });

    // No duplicate check: reading the list first added ~0.5 s to every signup. appendRow is atomic, so no lock either.
    // Repeat signups add repeat rows; Google Groups ignores duplicate members, and Data -> Data cleanup -> Remove
    // duplicates tidies the Sheet before any mail merge.
    subscribersTab(SpreadsheetApp.getActiveSpreadsheet())
      .appendRow([new Date(), email, String(body.source || 'site').replace(/[^\w.-]/g, '').slice(0, 100)]);
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

// The Subscribers tab, created with its header row on the first signup. A new spreadsheet's blank first tab is
// reused; a tab that already holds data is never renamed.
function subscribersTab(ss) {
  var sheet = ss.getSheetByName(TAB);
  if (sheet) return sheet;
  var first = ss.getSheets()[0];
  sheet = first.getLastRow() === 0 ? first.setName(TAB) : ss.insertSheet(TAB);
  sheet.appendRow(['timestamp', 'email', 'source']);
  return sheet;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
