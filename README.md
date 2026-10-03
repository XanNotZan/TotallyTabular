# Totally Tabular — website

Static site for totallytabular.org. One page (`index.html`), one data file (`blog.json`), no build step.

## Files

- `index.html` — the whole site (Home, Projects, Blog, About Us, Subscribe modal).
- `blog.json` — the posts the Blog page shows. Sample posts until the Substack exists.
- `fetch_substack.py` — rebuilds `blog.json` from a Substack RSS feed. `python3 fetch_substack.py https://NAME.substack.com`
- `.github/workflows/refresh-blog.yml` — runs that script on a schedule once the `SUBSTACK_URL` repository variable is set.
- `apps-script/Code.gs` — the Google Apps Script that receives Subscribe form submissions into a Google Sheet. Setup steps are at the top of the file.
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

Follow the steps at the top of `apps-script/Code.gs`, then paste the deployment URL into `SUBSCRIBE_ENDPOINT` in `index.html`.
