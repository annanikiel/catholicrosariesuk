// Turns the JSON content into HTML. Everything here is plain functions returning strings.

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Rendering context: set once per page by build.mjs.
export const ctx = { site: null, isHome: false, reviews: null, map: null };

// Link targets in the JSON can be:
//   "{etsy}"        the Etsy shop link from site.json
//   "#contact"      a section on the home page (works from every page)
//   "privacy.html"  another page, or any https:// or mailto: link
export function href(value) {
  let h = String(value ?? '').trim().replaceAll('{etsy}', ctx.site.etsyUrl);
  if (/^[a-z][a-z0-9+.-]*:/i.test(h) && !/^(https?|mailto|tel):/i.test(h)) h = '#'; // no javascript: etc.
  if (ctx.isHome && h.startsWith('./#')) h = h.slice(2);
  if (!ctx.isHome && h.startsWith('#')) h = './' + h;
  return esc(h);
}

// Inline formatting inside any text: *italic*, **bold** and [link text](address).
// Square brackets without an address, like [Your story], are left as they are.
export function md(text) {
  if (typeof text !== 'string') throw new Error(`expected some text but found ${text === undefined ? 'nothing' : JSON.stringify(text)}`);
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${href(url.replaceAll('&amp;', '&'))}">${label}</a>`)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

const para = (text, cls = '') => {
  const c = [cls, text.trim().startsWith('[') ? 'placeholder' : ''].filter(Boolean).join(' ');
  return `<p${c ? ` class="${c}"` : ''}>${md(text)}</p>`;
};

export const button = (b, fallbackStyle = 'dark') =>
  `<a href="${href(b.href)}" class="btn btn-${esc(b.style || fallbackStyle)}">${md(b.label)}</a>`;

// Several versions of the same block: all are written into the page, and a tiny script shows a random one.
// Blocks with the same group name pick the same version (e.g. the mission heading and its text).
function variants(group, list, renderOne) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('"variants" needs at least one version');
  if (list.length === 1) return renderOne(list[0]);
  const items = list.map((v, i) => `<div data-variant${i ? ' hidden' : ''}>${renderOne(v)}</div>`).join('');
  return `<div data-variants="${esc(group)}">${items}<script>cruk.pick(document.currentScript.parentNode)</script></div>`;
}

const photoBox = (cls, item, placeholder) =>
  item.photo
    ? `<div class="${cls} has-img"><img src="${esc(item.photo)}" alt="${esc(item.photoAlt || '')}" loading="lazy"></div>`
    : `<div class="${cls}">${md(placeholder)}</div>`;

const dot = (color) => `<span class="dot" style="background:${esc(color)}" aria-hidden="true"></span>`;

// ---------- Home page sections ----------

export const sections = {
  hero: (s) => `
<section id="top" class="container hero">
  <div class="hero-text">
    ${variants('hero', s.variants, (v) => `<h1>${md(v.heading)}</h1>\n<p class="lead">${md(v.lead)}</p>`)}
    <div class="btn-row">${s.buttons.map((b, i) => button(b, i ? 'blush' : 'dark')).join('')}</div>
  </div>
  <div class="hero-art">
    <div class="halo">
      <span class="bead bead-purple" aria-hidden="true"></span>
      <span class="bead bead-green" aria-hidden="true"></span>
      <span class="bead bead-amber" aria-hidden="true"></span>
      <img src="images/logo.png" alt="${esc(s.logoAlt)}">
    </div>
  </div>
</section>`,

  mission: (s) => `
<section id="mission" class="band-dark">
  <div class="container split">
    <div class="split-head">
      <p class="eyebrow">${md(s.eyebrow)}</p>
      ${variants('mission', s.variants, (v) => `<h2>${md(v.heading)}</h2>`)}
      ${s.photo ? `<img class="mission-photo" src="${esc(s.photo)}" alt="${esc(s.photoAlt || '')}" loading="lazy">` : ''}
    </div>
    <div class="split-body">
      ${variants('mission', s.variants, (v) => (v.intro || []).map((p) => para(p)).join('\n'))}
      ${(s.paragraphs || []).map((p) => para(p)).join('\n      ')}
    </div>
  </div>
</section>`,

  newsletter: (s) => `
<section id="newsletter" class="container-narrow newsletter-wrap">
  <div class="newsletter">
    <div>
      <p class="eyebrow">${md(s.eyebrow)}</p>
      <h2>${md(s.heading)}</h2>
      <p>${md(s.text)}</p>
    </div>
    <div>
      <form id="newsletter-form" class="js-api-form" data-endpoint="/subscribe" novalidate data-success="${esc(s.success)}">
        <label for="nl-email">${md(s.label)}</label>
        <div class="inline-field">
          <input id="nl-email" name="email" type="email" required autocomplete="email" maxlength="254" placeholder="${esc(s.placeholder || '')}">
          <button type="submit" class="btn btn-dark">${md(s.button)}</button>
        </div>
        <div class="hp" aria-hidden="true"><label for="nl-website">Leave this empty</label><input id="nl-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <p class="form-note">${md(s.note)}</p>
        <p class="form-error" role="alert" hidden></p>
      </form>
    </div>
  </div>
</section>`,

  make: (s) => `
<section id="make" class="container section">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  <div class="grid grid-280">
    ${s.items.map((p) => `
    <article class="card product">
      ${photoBox('photo', p, p.placeholder || 'Photo')}
      <h3>${dot(p.dot || '#E8788A')}${md(p.title)}</h3>
      <p>${md(p.text)}</p>
    </article>`).join('')}
  </div>
</section>`,

  beads: (s) => `
<section id="beads" class="container section">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  <p class="intro">${md(s.intro)}</p>
  <div class="grid grid-250">
    ${s.items.map((b) => `
    <article class="card stone">
      <div class="swatches" aria-hidden="true">${(b.swatches || []).map((c) => `<span style="background:${esc(c)}"></span>`).join('')}</div>
      <p class="kind">${md(b.kind)}</p>
      <h3>${md(b.title)}</h3>
      <p>${md(b.text)}</p>
    </article>`).join('')}
  </div>
  ${s.sizes ? `
  <div class="sizes">
    <h3>${md(s.sizes.heading)}</h3>
    ${s.sizes.items.map((z) => `<p><span class="size-dot" style="width:${Number(z.dotSize) || 20}px;height:${Number(z.dotSize) || 20}px" aria-hidden="true"></span><span><strong>${md(z.size)}</strong>: ${md(z.text)}</span></p>`).join('\n    ')}
  </div>` : ''}
</section>`,

  medals: (s) => `
<section id="medals" class="container section">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  <p class="intro">${md(s.intro)}</p>
  <div class="grid grid-300">
    ${s.items.map((m) => `
    <article class="card medal">
      ${photoBox('medal-photo', m, 'Photo')}
      <h3>${md(m.title)}</h3>
      <p>${md(m.text)}</p>
    </article>`).join('')}
  </div>
</section>`,

  pray: (s) => `
<section id="pray" class="container section section-last">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  <p class="intro">${md(s.intro)}</p>
  <div class="pray-layout">
    <div class="card steps">
      <h3>${md(s.steps.heading)}</h3>
      <ol>${s.steps.items.map((t) => `<li>${md(t)}</li>`).join('')}</ol>
    </div>
    <div class="mysteries">
      <h3>${md(s.mysteries.heading)}</h3>
      ${s.mysteries.items.map((m) => `
      <details class="accordion" name="mysteries">
        <summary>${dot(m.dot || '#E8788A')}<span class="acc-title">${md(m.name)}</span><span class="acc-meta">${md(m.days || '')}</span></summary>
        <ol>${m.list.map((t) => `<li>${md(t)}</li>`).join('')}</ol>
      </details>`).join('')}
      ${s.mysteries.note ? `<p class="note">${md(s.mysteries.note)}</p>` : ''}
    </div>
  </div>
  <h3 class="prayers-title">${md(s.prayers.heading)}</h3>
  <div class="grid grid-320 prayers">
    ${s.prayers.items.map((p) => `
    <details class="accordion" name="prayers"><summary><span class="acc-title-sans">${md(p.title)}</span></summary>
      <p class="prayer">${p.lines.map(md).join('\n')}</p></details>`).join('')}
  </div>
</section>`,

  contact: (s) => `
<section id="contact" class="band-white">
  <div class="container split">
    <div class="split-head">
      <p class="eyebrow">${md(s.eyebrow)}</p>
      <h2>${md(s.heading)}</h2>
      <p class="muted">${md(s.text)}</p>
    </div>
    <div class="split-body">
      <form id="contact-form" class="js-api-form contact-form" data-endpoint="/contact" novalidate data-success="${esc(s.success)}">
        <div class="field-row">
          <div class="field"><label for="ct-name">${md(s.nameLabel)}</label><input id="ct-name" name="name" type="text" required autocomplete="name" maxlength="100"></div>
          <div class="field"><label for="ct-email">${md(s.emailLabel)}</label><input id="ct-email" name="email" type="email" required autocomplete="email" maxlength="254"></div>
        </div>
        <div class="field"><label for="ct-message">${md(s.messageLabel)}</label><textarea id="ct-message" name="message" rows="5" required maxlength="5000"></textarea></div>
        <div class="hp" aria-hidden="true"><label for="ct-website">Leave this empty</label><input id="ct-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <p class="form-note">${md(s.note)}</p>
        <p class="form-error" role="alert" hidden></p>
        <div><button type="submit" class="btn btn-dark">${md(s.button)}</button></div>
      </form>
    </div>
  </div>
</section>`,

  reviews: (s) => {
    const items = (ctx.reviews?.items || []).filter((r) => r && r.text);
    const show = Math.max(1, Number(s.show) || 3);
    const stars = (n) => {
      const k = Math.max(0, Math.min(5, Math.round(Number(n) || 5)));
      return `<p class="stars" role="img" aria-label="${k} out of 5 stars">${'<span>★</span>'.repeat(k)}${'<span class="off">★</span>'.repeat(5 - k)}</p>`;
    };
    const meta = (r) => [r.product, r.date].filter((x) => x && !String(x).startsWith('[')).map(md).join(' · ');
    return `
<section id="reviews" class="container section">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  ${s.intro ? `<p class="intro">${md(s.intro)}</p>` : ''}
  <div class="grid grid-300 reviews"${items.length > show ? ` data-pick-some="${show}"` : ''}>
    ${items.map((r, i) => `
    <figure class="card review"${i >= show ? ' hidden' : ''}>
      ${stars(r.stars)}
      <blockquote>${para(r.text)}</blockquote>
      <figcaption><strong>${md(r.name || '')}</strong>${meta(r) ? `<span>${meta(r)}</span>` : ''}</figcaption>
    </figure>`).join('')}
    ${items.length > show ? `<script>cruk.pickSome(document.currentScript.parentNode, ${show})</script>` : ''}
  </div>
  ${s.button ? `<div class="btn-row reviews-more">${button(s.button, 'blush')}</div>` : ''}
</section>`;
  },

  map: (s) => {
    const m = ctx.map;
    const fill = (t) => md(t).replaceAll('{cities}', m.places.length).replaceAll('{countries}', m.countries.length);
    const byCountry = m.countries.map((c) => `<li><strong>${esc(c)}:</strong> ${m.places.filter((p) => p.country === c).map((p) => esc(p.city)).join(', ')}</li>`);
    return `
<section id="map" class="container section">
  <p class="eyebrow">${md(s.eyebrow)}</p>
  <h2>${md(s.heading)}</h2>
  ${s.intro ? `<p class="intro">${md(s.intro)}</p>` : ''}
  <div class="map-wrap" data-map>
    <svg class="world-map" viewBox="0 0 ${m.width} ${m.height}" role="img" aria-label="${esc(`World map: ${m.places.length} places in ${m.countries.length} countries. The full list is below the map.`)}">
      <g class="land">${m.shapes.map((c) => `<path${c.visited ? ' class="visited"' : ''} d="${c.d}"/>`).join('')}</g>
      <g class="pins">${m.places.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="5" data-label="${esc(`${p.city}, ${p.country}`)}"/>`).join('')}</g>
    </svg>
    <div class="map-controls">
      <button type="button" data-zoom="in" aria-label="${esc(s.zoomIn || 'Zoom in')}" title="${esc(s.zoomIn || 'Zoom in')}">+</button>
      <button type="button" data-zoom="out" aria-label="${esc(s.zoomOut || 'Zoom out')}" title="${esc(s.zoomOut || 'Zoom out')}">−</button>
      <button type="button" data-zoom="reset" aria-label="${esc(s.reset || 'Show the whole world')}" title="${esc(s.reset || 'Show the whole world')}">⟲</button>
    </div>
    <p class="map-tip" hidden></p>
  </div>
  ${s.summary ? `<p class="map-summary">${fill(s.summary)}</p>` : ''}
  <details class="map-list">
    <summary>${md(s.listLabel || 'See the list of places')}</summary>
    <ul>${byCountry.join('')}</ul>
  </details>
  ${s.credit ? `<p class="map-credit">${md(s.credit)}</p>` : ''}
</section>`;
  },

  closing: (s) => `
<section class="band-dark closing">
  <div class="container closing-inner">
    <img src="images/logo-160.png" alt="" class="closing-logo" loading="lazy">
    ${variants('closing', s.variants || [s], (v) => `<h2>${md(v.heading)}</h2>\n<p>${md(v.text)}</p>`)}
    ${s.button ? button(s.button, 'pink') : ''}
  </div>
</section>`,
};

// ---------- Other pages ----------

export function privacyBody(c) {
  const block = (b) =>
    Array.isArray(b) ? `<ul>${b.map((li) => `<li>${md(li)}</li>`).join('')}</ul>` : `<p>${md(b)}</p>`;
  return `
  <p class="eyebrow">${md(c.eyebrow)}</p>
  <h1>${md(c.heading)}</h1>
  ${c.updated ? `<p><em>${md(c.updated)}</em></p>` : ''}
  ${c.intro ? `<p>${md(c.intro)}</p>` : ''}
  ${c.sections.map((s) => `
  <h2>${md(s.heading)}</h2>
  ${s.content.map(block).join('\n  ')}`).join('')}`;
}

// Newsletter confirm and unsubscribe pages: a button that posts the ?e=&t= link values to the API.
export function linkActionBody(c) {
  return `
  <p class="eyebrow">${md(c.eyebrow)}</p>
  <div id="action" data-link-action>
    <h1>${md(c.action.heading)}</h1>
    <p>${md(c.action.text)}</p>
    <p class="form-error" role="alert" hidden></p>
    <div class="btn-row"><button type="button" class="btn btn-dark" data-endpoint="${esc(c.endpoint)}">${md(c.action.button)}</button></div>
  </div>
  <div id="done" hidden tabindex="-1">
    <h1>${md(c.done.heading)}</h1>
    <p>${md(c.done.text)}</p>
    ${c.done.buttons?.length ? `<div class="btn-row">${c.done.buttons.map((b) => button(b)).join('')}</div>` : ''}
  </div>
  <div id="bad" hidden>
    <h1>${md(c.invalid.heading)}</h1>
    <p>${md(c.invalid.text)}</p>
  </div>`;
}

export function notFoundBody(c) {
  return `
  <h1>${md(c.heading)}</h1>
  <p>${md(c.text)}</p>
  ${c.button ? `<div class="btn-row">${button(c.button)}</div>` : ''}`;
}
