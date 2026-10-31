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
| `backend/src/` | Lambda code (Node.js 22, no dependencies to install) |
| `backend/scripts/send-newsletter.mjs` | Sends a newsletter to everyone who's confirmed |
| `backend/newsletters/` | Example newsletter (HTML and plain text) |

## Setting it up

You'll do these steps once. Allow an afternoon, plus a day or so of waiting for AWS to approve SES.

### 1. Put the website on GitHub Pages

1. Merge this branch into `main`.
2. In the GitHub repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The "Deploy website to GitHub Pages" workflow runs on every push to `main` that changes `site/`. The site appears at `https://<your-github-username>.github.io/catholicrosariesuk/`.

### 2. Point CatholicRosaries.uk at it

1. In **Settings → Pages → Custom domain**, enter `catholicrosaries.uk` and save.
2. At your domain registrar, add these DNS records:
   - Four `A` records for `catholicrosaries.uk` (the "apex" or `@`): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - A `CNAME` record for `www` pointing to `<your-github-username>.github.io`
3. Once GitHub shows the domain as verified, tick **Enforce HTTPS**.

(GitHub's guide: <https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site>)

### 3. Deploy the AWS backend

You need an AWS account, the [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (signed in with `aws configure` or `aws sso login`) and the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html).

Use the **London region (`eu-west-2`)** so the data stays in the UK.

```bash
cd backend
```

```bash
sam deploy --guided --region eu-west-2
```

Answer the questions like this:

| Prompt | Answer |
| --- | --- |
| Stack Name | `catholic-rosaries-backend` (the newsletter script expects this name) |
| SiteUrl | `https://catholicrosaries.uk` |
| AllowedOrigins | `https://catholicrosaries.uk,https://www.catholicrosaries.uk,https://<your-github-username>.github.io` |
| OwnerEmail | the inbox where contact messages should go |
| FromAddress | e.g. `Catholic Rosaries UK <hello@catholicrosaries.uk>` |
| SesDomain | `catholicrosaries.uk` |
| CreateSesIdentity | `true` (unless you've already verified the domain in SES) |
| "...may not have authorization defined, Is this okay?" | `y` (the forms are public on purpose) |
| Save arguments to configuration file | `y` (later deploys are then just `sam deploy`) |

When it finishes it prints some **Outputs**. You need:

- **ApiUrl**: the address of your API.
- **DkimRecord1–3**: three DNS records for the next step.

### 4. Set up Amazon SES (email sending)

1. **Verify the domain.** At your registrar, add the three DKIM records from the outputs as `CNAME` records (each output reads `name -> value`). Within an hour or so, **SES → Identities → catholicrosaries.uk** should show *Verified*.
2. **Add SPF and DMARC records** (recommended, helps emails land in the inbox rather than spam):
   - `TXT` on `_dmarc.catholicrosaries.uk`: `v=DMARC1; p=none; rua=mailto:<your email>`
   - Optionally, set a [custom MAIL FROM domain](https://docs.aws.amazon.com/ses/latest/dg/mail-from.html) in SES for full SPF alignment.
3. **Request production access.** New SES accounts are in a "sandbox" and can only email addresses you've verified. In **SES → Account dashboard → Request production access**, explain: *"Transactional emails (contact form notifications and double opt-in confirmations) and a monthly newsletter to people who have confirmed their subscription, with one-click unsubscribe. Expected volume: under 1,000 emails a month."* Approval usually takes about a day.
   - While waiting, you can test by verifying your own address under **SES → Identities → Create identity → Email address**.
4. **Receiving email at `hello@catholicrosaries.uk`.** SES only *sends*. Replies to newsletters go to the From address, so make sure that address can receive mail, e.g. with your registrar's email forwarding, or set `FromAddress` to an address you already read.

### 5. Connect the website to the API

Do **one** of these:

- **Recommended:** in GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add a repository variable `API_BASE_URL` set to the **ApiUrl** output. Then re-run the Pages workflow (Actions → Deploy website to GitHub Pages → Run workflow).
- Or edit `site/config.js` and paste the ApiUrl into `apiBaseUrl`.

Now test both forms on the live site.

## Sending a newsletter

1. Copy `backend/newsletters/example.html` and `example.txt` and write your news in both. Don't add an unsubscribe link: the script adds a personal one to every email, plus the headers that make Gmail and Outlook show their own Unsubscribe button.
2. From the `backend` folder, install the script's dependencies once:

   ```bash
   npm install
   ```

3. Check how many people it will go to (sends nothing):

   ```bash
   npm run newsletter -- --subject "New rosaries for Advent" --html newsletters/advent.html --text newsletters/advent.txt
   ```

4. Send yourself a test copy:

   ```bash
   npm run newsletter -- --subject "New rosaries for Advent" --html newsletters/advent.html --text newsletters/advent.txt --to you@example.com
   ```

5. Send it to everyone:

   ```bash
   npm run newsletter -- --subject "New rosaries for Advent" --html newsletters/advent.html --text newsletters/advent.txt --send
   ```

## How the forms work

**Contact form** (`POST /contact`): validates the name, email and message, then sends them to `OwnerEmail` through SES with *Reply-To* set to the visitor. Messages aren't stored anywhere else.

**Newsletter** (double opt-in):

1. `POST /subscribe` saves the address as *pending* and emails a confirmation link. Pending sign-ups are deleted automatically after 7 days (DynamoDB TTL). The same address won't get more than one confirmation email every 10 minutes, and the response never reveals whether someone is already subscribed.
2. The link opens `newsletter-confirm.html`, where the person presses **Confirm**, which calls `POST /subscribe/confirm`. A button press (instead of confirming as soon as the link opens) stops email security scanners from confirming on someone's behalf.
3. Unsubscribing (`POST /unsubscribe`) deletes the address completely. It works from `unsubscribe.html` and from the email app's own one-click button (RFC 8058).

**Spam protection:** each form has a hidden "honeypot" field and a minimum time-to-submit; bots that trip either get a fake success. The API is also rate-limited (5 requests a second, bursts of 10). If spam becomes a problem, [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) is the next step.

**Logs** are kept for 30 days. The subscribers table has point-in-time backups and is kept even if the stack is deleted.

## Developing

- **Preview the site:** open `site/index.html` in a browser, or run `python3 -m http.server -d site 8080` and go to <http://localhost:8080>. To test the forms locally, add `http://localhost:8080` to `AllowedOrigins`, redeploy, and put the ApiUrl in `site/config.js`.
- **Backend tests:** `cd backend && npm install && npm test`. They run against in-memory stand-ins for DynamoDB and SES, so no AWS account is needed. GitHub Actions runs them, plus `cfn-lint` on the template, on every push.
- **Redeploy the backend** after changing it: `cd backend && sam deploy`.

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
