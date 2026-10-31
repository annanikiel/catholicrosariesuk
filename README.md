# CatholicRosaries.uk

Website for **Catholic Rosaries UK**, a small business selling handmade, wire-linked rosaries on Etsy.

- **Website:** plain HTML and CSS in [`site/`](site/), hosted free on **GitHub Pages**.
- **Forms:** a small serverless backend on **AWS** in [`backend/`](backend/):
  - **Contact form:** emails each message to you, so you can just press Reply.
  - **Newsletter:** double opt-in sign-up (UK GDPR friendly), stored in DynamoDB, sent with **Amazon SES**, and every email has an unsubscribe link.

```
Browser ──► GitHub Pages (site/)
   │
   └─ form POST ──► API Gateway ──► Lambda ──► SES (sends email)
                                     └──────► DynamoDB (newsletter subscribers)
```

At this size it should cost little or nothing: Lambda, API Gateway and DynamoDB stay within or close to the AWS free tier, and SES charges about $0.10 per 1,000 emails.

## What's where

| Path | What it is |
| --- | --- |
| `site/index.html` | The home page |
| `site/styles.css` | All styles. Brand colours are CSS variables at the top. |
| `site/script.js` | Sends the forms to the API, with "sending", success and error states |
| `site/config.js` | The API address (`apiBaseUrl`) |
| `site/privacy.html` | Privacy notice (has placeholders to fill in) |
| `site/newsletter-confirm.html` | Page people land on from the "confirm your subscription" email |
| `site/unsubscribe.html` | Page people land on from the unsubscribe link |
| `backend/template.yaml` | AWS SAM template: the API, four Lambda functions, the DynamoDB table and the SES domain |
| `backend/aws-setup.yaml` | One-time setup you upload in the CloudFormation console: lets GitHub Actions deploy to AWS |
| `.github/workflows/` | Buttons in the Actions tab: deploy the website, deploy the backend, send a newsletter, run tests |
| `backend/src/` | Lambda code (Node.js 22, no dependencies to install) |
| `backend/scripts/send-newsletter.mjs` | Sends a newsletter to everyone who's confirmed |
| `backend/newsletters/` | Example newsletter (HTML and plain text) |

## Setting it up

Everything below is done by clicking in the AWS console and on GitHub. No command line needed.

You'll do these steps once. Allow an afternoon, plus about a day of waiting for AWS to approve sending email.

How it fits together: you create one small "setup" stack in the AWS console. It lets this repository's GitHub Actions sign in to your AWS account, but only from the `main` branch, and without any AWS keys stored in GitHub. After that, deploying the backend and sending a newsletter are both a **Run workflow** button in the **Actions** tab.

### 1. Put the website on GitHub Pages

1. In the GitHub repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Go to **Actions → Deploy website to GitHub Pages → Run workflow** (or push a change to `site/`).
3. The site appears at `https://<your-github-username>.github.io/catholicrosariesuk/`. The forms won't work until step 5.

### 2. One-time AWS setup (connect GitHub to AWS)

1. Sign in to the AWS console and switch the region (top right) to **Europe (London) eu-west-2**. Use this region throughout, so data stays in the UK.
2. On GitHub, open [`backend/aws-setup.yaml`](backend/aws-setup.yaml) and click **Download raw file**.
3. In AWS, open **CloudFormation → Create stack → With new resources (standard)**.
   - **Choose an existing template → Upload a template file**, and choose `aws-setup.yaml`. Click **Next**.
   - **Stack name:** `catholic-rosaries-setup`
   - Leave the parameters as they are, unless **IAM → Identity providers** already lists `token.actions.githubusercontent.com`. In that case set **CreateGitHubConnection** to `false`.
   - Click **Next**, **Next**, tick **"I acknowledge that AWS CloudFormation might create IAM resources"**, then **Submit**.
4. Wait for **CREATE_COMPLETE** (about a minute), open the **Outputs** tab and copy **RoleArn**.
5. On GitHub, go to **Settings → Secrets and variables → Actions**:
   - **Secrets** tab → **New repository secret**:
     - `AWS_ROLE_ARN`: the RoleArn you just copied
     - `OWNER_EMAIL`: the inbox where contact form messages should go
   - **Variables** tab → **New repository variable** (optional):
     - `FROM_ADDRESS`: the sender for all emails. Defaults to `Catholic Rosaries UK <hello@catholicrosaries.uk>`.

Secrets are never shown in logs, which matters because this repository is public.

### 3. Deploy the backend

1. On GitHub, go to **Actions → Deploy AWS backend → Run workflow** (branch `main`).
2. It runs the tests, then creates everything in AWS (takes 2–3 minutes). When it's done, open the run. The summary at the bottom lists:
   - **ApiUrl**: the address of your API.
   - **DkimRecord1–3**: three DNS records for the next step.

Run the same workflow again any time the backend changes. If the very first run fails part-way, delete the `catholic-rosaries-backend` stack in **CloudFormation** before running it again.

### 4. Set up Amazon SES (email sending)

All of this is in the AWS console, under **Amazon SES** (still in eu-west-2).

1. **Verify the domain.** At your domain registrar, add the three DKIM records as `CNAME` records. The workflow summary shows them as `name -> value`, and **SES → Identities → catholicrosaries.uk → Authentication** shows the same three. Within an hour or so the identity shows *Verified*. This only adds email records. It doesn't touch the website, so it's fine to do before the domain points at GitHub Pages.
2. **Add a DMARC record** (helps emails land in the inbox rather than spam): a `TXT` record on `_dmarc.catholicrosaries.uk` with the value `v=DMARC1; p=none; rua=mailto:<your email>`.
   - Optionally, in **SES → Identities → catholicrosaries.uk → Custom MAIL FROM domain**, set `mail.catholicrosaries.uk` and add the two records it shows. This gives full SPF alignment.
3. **Request production access.** New SES accounts are in a "sandbox" and can only email addresses you've verified. Go to **SES → Account dashboard → Request production access**, and say: *"Transactional emails (contact form notifications and double opt-in confirmations) and a monthly newsletter to people who have confirmed their subscription, with one-click unsubscribe. Expected volume: under 1,000 emails a month."* Approval usually takes about a day.
   - While you wait, you can test by verifying your own address under **SES → Identities → Create identity → Email address**.
4. **Make sure the From address can receive email.** SES only *sends*, and people will reply to newsletters. Set up forwarding for `hello@catholicrosaries.uk` at your registrar, or set `FROM_ADDRESS` to an address you already read.

### 5. Connect the website to the API

1. On GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `API_BASE_URL` with the **ApiUrl** value.
2. Go to **Actions → Deploy website to GitHub Pages → Run workflow**.
3. Test both forms on the GitHub Pages site. Until production access comes through, use an email address you've verified in SES.

### 6. Last: point CatholicRosaries.uk at the site

1. In **Settings → Pages → Custom domain**, enter `catholicrosaries.uk` and save.
2. At your domain registrar, add these DNS records:
   - Four `A` records for `catholicrosaries.uk` (the "apex" or `@`): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - A `CNAME` record for `www` pointing to `<your-github-username>.github.io`
3. Once GitHub shows the domain as verified, tick **Enforce HTTPS**.
4. Add a repository **variable** `SITE_URL` = `https://catholicrosaries.uk`, then run **Deploy AWS backend** again, so the links in confirmation and unsubscribe emails use the new address.

(GitHub's guide: <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>)

## Sending a newsletter

1. On GitHub, open the `backend/newsletters` folder on `main` and use **Add file → Create new file** to make two files with the same name: e.g. `2026-12-advent.html` and `2026-12-advent.txt`. Copy `example.html` and `example.txt` to start from. Don't add an unsubscribe link: one is added to every email automatically, along with the headers that make Gmail and Outlook show their own Unsubscribe button.
   - The repository is public, so anyone could read the newsletter here before you send it.
2. Go to **Actions → Send newsletter → Run workflow** and fill in the file name (`2026-12-advent`) and subject line.
3. Run it three times, changing **mode** each time:
   1. `dry-run`: shows how many subscribers it will go to. Nothing is sent.
   2. `test`: sends one copy to your `OWNER_EMAIL`. Check it on your phone too.
   3. `send-to-everyone`: sends it to everyone.

Workflow logs on a public repository are public, so the script never prints anyone's email address. The log does show the number of subscribers.

## How the forms work

**Contact form** (`POST /contact`): validates the name, email and message, then sends them to `OwnerEmail` through SES with *Reply-To* set to the visitor. Messages aren't stored anywhere else.

**Newsletter** (double opt-in):

1. `POST /subscribe` saves the address as *pending* and emails a confirmation link. Pending sign-ups are deleted automatically after 7 days (DynamoDB TTL). The same address won't get more than one confirmation email every 10 minutes, and the response never reveals whether someone is already subscribed.
2. The link opens `newsletter-confirm.html`, where the person presses **Confirm**, which calls `POST /subscribe/confirm`. A button press (instead of confirming as soon as the link opens) stops email security scanners from confirming on someone's behalf.
3. Unsubscribing (`POST /unsubscribe`) deletes the address completely. It works from `unsubscribe.html` and from the email app's own one-click button (RFC 8058).

**Spam protection:** each form has a hidden "honeypot" field and a minimum time-to-submit; bots that trip either get a fake success. The API is also rate-limited (5 requests a second, bursts of 10). If spam becomes a problem, [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) is the next step.

**Logs** are kept for 30 days. The subscribers table has point-in-time backups and is kept even if the stack is deleted.

## Developing

- **Preview the site:** open `site/index.html` in a browser, or run `python3 -m http.server -d site 8080` and go to <http://localhost:8080>. To test the forms locally, add `http://localhost:8080` to the `ALLOWED_ORIGINS` variable, redeploy, and put the ApiUrl in `site/config.js`.
- **Backend tests:** `cd backend && npm install && npm test`. They run against in-memory stand-ins for DynamoDB and SES, so no AWS account is needed. GitHub Actions runs them, plus `cfn-lint` on the template, on every push.
- **Redeploy the backend** after changing it: **Actions → Deploy AWS backend → Run workflow**. If you prefer the command line, `sam deploy --guided --region eu-west-2 --stack-name catholic-rosaries-backend` from `backend/` also works.

## Still to do

- [ ] Replace `[YOUR ETSY SHOP LINK]` everywhere (`site/*.html` and `backend/newsletters/example.*`). Search the files for `[`.
- [ ] Mission section: `[Your story …]` in `site/index.html`.
- [ ] Newsletter section: `[How often you’ll email …]` in `site/index.html`.
- [ ] Privacy notice: fill in `[YOUR FULL NAME]`, `[YOUR CONTACT EMAIL]`, `[DATE]` and the contact message retention period in `site/privacy.html`. If you aren't already, [register with the ICO](https://ico.org.uk/for-organisations/data-protection-fee/) (most small businesses pay the lowest tier, and some are exempt).
- [ ] **Photos:** swap each `.photo` / `.medal-photo` placeholder for an `<img>` (the CSS is ready). Keep each photo under about 200 KB (e.g. resize to 1200px wide with [Squoosh](https://squoosh.app)) and write meaningful alt text.
- [ ] Optional: self-host the two fonts instead of loading them from Google Fonts, so visitors' browsers don't connect to Google.

## Adding content later

- **New product:** copy an `<article class="card product">` block in `#make`. The grid wraps automatically.
- **New bead type:** copy an `<article class="card stone">` block in `#beads`.
- **New medal:** copy an `<article class="card medal">` block in `#medals`.
- The mysteries and prayers use native `<details>` accordions. The shared `name` attribute means only one is open at a time.

## Brand

- Ink/brown `#2A0B14` and pink `#E8788A` come from the logo. Buttons use only these two.
- Gem accents (purple `#8E4DB8`, green `#2F8A63`, amber `#E39A3B`) are used sparingly, only as small dots.
- Fonts: Fraunces (headings) and Nunito Sans (body).
- Ethos: "contemplatives in action": finding silence in your heart in the busyness of daily life.
