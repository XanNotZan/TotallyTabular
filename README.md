# Totally Tabular — website

Static site for totallytabular.org. One page (`index.html`), one data file (`blog.json`), no build step.

## Files

- `index.html` — the whole site (Home, Projects, Blog, About Us, Subscribe modal).
- `blog.json` — the posts the Blog page shows. Sample posts until the Substack exists.
- `fetch_substack.py` — rebuilds `blog.json` from a Substack RSS feed. `python3 fetch_substack.py https://NAME.substack.com`
- `.github/workflows/refresh-blog.yml` — runs that script on a schedule once the `SUBSTACK_URL` repository variable is set.
- `firestore/` — the rules for the mailing list's Firestore inbox, where the Subscribe form saves each address.
- `apps-script/Code.gs` — the Google Apps Script that moves signups from Firestore into a Google Sheet and emails the confirmation. `apps-script/appsscript.json` holds its web app settings.
- `CNAME` — tells GitHub Pages the custom domain.

## Going live on GitHub Pages

1. Create a public repository (for example `totallytabular/totallytabular.github.io`) and upload everything in this folder, including the hidden `.github` and `.nojekyll` entries.
2. Repo Settings -> Pages -> Build and deployment -> Source: "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Settings -> Pages -> Custom domain: `totallytabular.org`, Save. Tick "Enforce HTTPS" once the certificate is issued (usually within an hour of DNS resolving).

## DNS at Squarespace (the domain registrar)

Domains dashboard -> totallytabular.org -> DNS -> DNS settings.

1. Delete the "Squarespace Defaults" group (red trash can). The domain cannot point elsewhere while they exist.
2. Under Custom records, add:

   | Type  | Host | Data                     |
   |-------|------|--------------------------|
   | A     | @    | 185.199.108.153          |
   | A     | @    | 185.199.109.153          |
   | A     | @    | 185.199.110.153          |
   | A     | @    | 185.199.111.153          |
   | AAAA  | @    | 2606:50c0:8000::153      |
   | AAAA  | @    | 2606:50c0:8001::153      |
   | AAAA  | @    | 2606:50c0:8002::153      |
   | AAAA  | @    | 2606:50c0:8003::153      |
   | CNAME | www  | ORG-OR-USER.github.io    |

3. Leave every MX record and every TXT record alone: those are Google Workspace mail and domain verification.

DNS changes can take up to 24-48 hours, usually far less.

## Mailing list (Google Workspace)

The Subscribe form saves each address to Firestore, Google's database (Firebase project `totallytabular-mailing-list`, collection `signups`), and shows its success screen as soon as Firestore has it, a fraction of a second later. The rules in `firestore/firestore.rules` let the site only add an email: nobody can read, change or delete anything through the site's key. The page then nudges the Apps Script web app (`NUDGE` in `index.html`), which moves each waiting signup into the "Subscribers" tab of the "Totally Tabular mailing list" Google Sheet in community@totallytabular.org's Drive, one row per address, and emails a confirmation from that account. A trigger runs the same step every minute, so a lost nudge only delays the email; `installTrigger`, run once from the Apps Script editor, sets it up.

The "confirmation sent" column records each email: a blank cell means the send failed, and signing up again retries it. At most 200 confirmations go out per day, so fake signups can't use the account to email strangers. Failures are logged under Executions in the Apps Script editor.

To change the Firestore rules:

```sh
cd firestore
npx firebase-tools login       # once per machine, as community@totallytabular.org
npx firebase-tools deploy --only firestore:rules
```

If a deploy also creates the database, deploy the rules a second time: the new database's default deny-everything rules can land after yours.

The script is deployed from `apps-script/` with [clasp](https://github.com/google/clasp). To change it:

```sh
cd apps-script
npx @google/clasp login        # once per machine, as community@totallytabular.org
npx @google/clasp push
npx @google/clasp update-deployment <deployment ID>   # the part of NUDGE between /s/ and /exec
```

`update-deployment` keeps the same URL, so `index.html` stays as it is. `apps-script/.clasp.json`, which links the folder to the script, is gitignored because it holds the Sheet's ID. On a new machine, run `npx @google/clasp clone <script ID>` inside `apps-script/` (the script ID is in the Apps Script editor's URL).
