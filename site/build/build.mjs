#!/usr/bin/env node
// Builds the website: site/content/*.json + site/static/* -> _site/
//
//   node site/build/build.mjs
//
// GitHub Actions runs this on every push to main. If a JSON file has a mistake, the build stops with
// a message saying which file and where, and the live site stays as it was.
import { readFile, writeFile, cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ctx, esc, md, href, sections, privacyBody, linkActionBody, notFoundBody } from './render.mjs';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(siteDir, '..', '_site');
// The site's folder on the web server: "/catholicrosariesuk" on github.io, "" on the custom domain.
// Only the 404 page needs it, because it can be shown at any address.
const basePath = (process.env.BASE_PATH || '').replace(/\/+$/, '');

class ContentError extends Error {}

async function readJson(name) {
  const file = path.join(siteDir, 'content', name);
  const text = await readFile(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (err) {
    const pos = Number(/position (\d+)/.exec(err.message)?.[1]);
    let where = '';
    if (Number.isFinite(pos)) {
      const before = text.slice(0, pos).split('\n');
      where = ` around line ${before.length}, column ${before.at(-1).length + 1}`;
    }
    throw new ContentError(
      `site/content/${name} isn't valid JSON${where}.\n  ${err.message}\n` +
        `  Common causes: a missing comma between items, a comma after the last item, or a straight " inside text (use “ ” instead).`,
    );
  }
}

function attempt(where, fn) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ContentError) throw err;
    throw new ContentError(`Problem in ${where}: ${err.message}\n  Check the spelling of the field names and that nothing is missing.`);
  }
}

function layout(site, { title, description, body, main = '', noindex = false, pagePath = '', base = '' }) {
  const canonical = site.siteUrl.replace(/\/+$/, '') + '/' + pagePath;
  const nav = site.nav.map((n) => `<a href="${href(n.href)}">${md(n.label)}</a>`).join('\n      ');
  const footerLinks = site.footer.links.map((l) => `<a href="${href(l.href)}">${md(l.label)}</a>`).join(' · ');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${base ? `<base href="${esc(base)}">\n` : ''}<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description)}">\n` : ''}${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="icon" href="images/favicon.png">
${noindex ? '' : `<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(site.siteName)}">
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description)}">\n` : ''}<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(site.siteUrl.replace(/\/+$/, ''))}/images/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
`}<meta name="theme-color" content="#2A0B14">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400;1,9..144,600&family=Nunito+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
<script>
// Shows one random version of blocks that have several (see "variants" in content/home.json),
// avoiding the one this visitor saw last time.
window.cruk = { chosen: {}, pick: function (box) {
  var group = box.getAttribute('data-variants'), items = box.querySelectorAll('[data-variant]'), n = items.length, i = this.chosen[group];
  if (i === undefined || i >= n) {
    var last = -1, key = 'cruk-variant-' + group;
    try { last = parseInt(localStorage.getItem(key), 10); } catch (e) {}
    do { i = Math.floor(Math.random() * n); } while (n > 1 && i === last);
    try { localStorage.setItem(key, String(i)); } catch (e) {}
    this.chosen[group] = i;
  }
  for (var k = 0; k < n; k++) items[k].hidden = k !== i;
} };
</script>
</head>
<body>

<header class="site-header">
  <nav class="container nav" aria-label="Main">
    <a href="${href('./#top')}" class="brand">
      <img src="images/logo-160.png" alt="" width="40" height="50">
      <span>${md(site.brand.name)}<span class="accent">${md(site.brand.accent)}</span></span>
    </a>
    <div class="nav-links">
      ${nav}
      <a href="${href(site.navButton.href)}" class="btn btn-pink btn-sm">${md(site.navButton.label)}</a>
    </div>
  </nav>
</header>

<main${main ? ` class="${main}"` : ''}>
${body}
</main>

<footer class="site-footer">
  <div class="container footer-inner">
    <span>© <span id="year">${new Date().getFullYear()}</span> ${md(site.footer.copyright)}</span>
    <span>${footerLinks}</span>
  </div>
</footer>

<script type="application/json" id="cruk-text">${JSON.stringify(site.forms).replace(/</g, '\\u003c')}</script>
<script src="config.js"></script>
<script src="script.js"></script>
</body>
</html>
`;
}

async function build() {
  const site = await readJson('site.json');
  const home = await readJson('home.json');
  const privacy = await readJson('privacy.json');
  const confirm = await readJson('newsletter-confirm.json');
  const unsubscribe = await readJson('unsubscribe.json');
  const notFound = await readJson('not-found.json');
  ctx.site = site;

  const pages = {};

  ctx.isHome = true;
  const order = home.sectionOrder || Object.keys(sections);
  const homeBody = order
    .map((name) => {
      if (!sections[name]) throw new ContentError(`home.json "sectionOrder" has "${name}", which isn't a section. Available: ${Object.keys(sections).join(', ')}.`);
      if (!home[name]) throw new ContentError(`home.json "sectionOrder" lists "${name}", but there's no "${name}" block in home.json.`);
      return attempt(`home.json → "${name}"`, () => sections[name](home[name]));
    })
    .join('\n');
  pages['index.html'] = attempt('home.json', () =>
    layout(site, { title: home.meta.title, description: home.meta.description, body: homeBody }),
  );

  ctx.isHome = false;
  pages['privacy.html'] = attempt('privacy.json', () =>
    layout(site, { title: privacy.meta.title, description: privacy.meta.description, body: privacyBody(privacy), main: 'page', pagePath: 'privacy.html' }),
  );
  pages['newsletter-confirm.html'] = attempt('newsletter-confirm.json', () =>
    layout(site, { title: confirm.meta.title, body: linkActionBody(confirm), main: 'page', noindex: true }),
  );
  pages['unsubscribe.html'] = attempt('unsubscribe.json', () =>
    layout(site, { title: unsubscribe.meta.title, body: linkActionBody(unsubscribe), main: 'page', noindex: true }),
  );
  pages['404.html'] = attempt('not-found.json', () =>
    layout(site, { title: notFound.meta.title, body: notFoundBody(notFound), main: 'page', noindex: true, base: basePath + '/' }),
  );

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  await cp(path.join(siteDir, 'static'), outDir, { recursive: true });
  for (const [name, html] of Object.entries(pages)) await writeFile(path.join(outDir, name), html);
  console.log(`Built ${Object.keys(pages).length} pages into ${path.relative(process.cwd(), outDir) || outDir}`);
}

build().catch((err) => {
  if (err instanceof ContentError) {
    console.error(`\n✗ ${err.message}\n`);
    if (process.env.GITHUB_ACTIONS) console.log(`::error title=Website content problem::${err.message.split('\n')[0]}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
