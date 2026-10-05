# Totally Tabular — website

Static site for totallytabular.org. One page (`index.html`), one data file (`blog.json`), no build step.

## Files

- `index.html` — the whole site (Home, Projects, Blog, About Us, Subscribe modal).
- `blog.json` — the posts the Blog page shows. Sample posts until the Substack exists.
- `fetch_substack.py` — rebuilds `blog.json` from a Substack RSS feed. `python3 fetch_substack.py https://NAME.substack.com`
- `.github/workflows/refresh-blog.yml` — runs that script on a schedule once the `SUBSTACK_URL` repository variable is set.
- `apps-script/Code.gs` — the Google Apps Script that receives Subscribe form submissions into a Google Sheet. `apps-script/appsscript.json` holds its web app settings.
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

The Subscribe form posts to `SUBSCRIBE_ENDPOINT` in `index.html`, an Apps Script web app that adds each address to the "Subscribers" tab of the "Totally Tabular mailing list" Google Sheet in community@totallytabular.org's Drive. Failed signups are logged under Executions in the Apps Script editor.

The script is deployed from `apps-script/` with [clasp](https://github.com/google/clasp). To change it:

```sh
cd apps-script
npx @google/clasp login        # once per machine, as community@totallytabular.org
npx @google/clasp push
npx @google/clasp update-deployment <deployment ID>   # the part of SUBSCRIBE_ENDPOINT between /s/ and /exec
```

`update-deployment` keeps the same URL, so `index.html` stays as it is. `apps-script/.clasp.json`, which links the folder to the script, is gitignored because it holds the Sheet's ID. On a new machine, run `npx @google/clasp clone <script ID>` inside `apps-script/` (the script ID is in the Apps Script editor's URL).
