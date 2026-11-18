// Builds the "where my rosaries have gone" world map from content/orders-map.json.
//
// Each place only needs a city and a country. Coordinates are looked up in a bundled list of
// ~220,000 places (GeoNames: towns over 1,000 people worldwide, and every village in the UK and Ireland).
// For anywhere it doesn't know, add "lat" and "lng".
// The same city listed more than once becomes a single dot.
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WIDTH = 1000;

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^st\.? /, 'saint ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Everyday names that differ from the official ones.
const COUNTRY_ALIASES = {
  uk: 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  usa: 'US', 'united states of america': 'US', america: 'US',
  holland: 'NL', netherlands: 'NL', 'the netherlands': 'NL', 'czech republic': 'CZ', 'republic of ireland': 'IE', eire: 'IE',
  'south korea': 'KR', korea: 'KR', russia: 'RU', vatican: 'VA', 'vatican city': 'VA', 'holy see': 'VA',
};

// world-atlas country names that don't match GeoNames country names.
const MAP_NAME_FIXES = {
  'United States of America': 'US', 'Dem. Rep. Congo': 'CD', 'Central African Rep.': 'CF', 'Bosnia and Herz.': 'BA',
  'Dominican Rep.': 'DO', 'Czechia': 'CZ', 'eSwatini': 'SZ', 'S. Sudan': 'SS', 'Solomon Is.': 'SB', 'Eq. Guinea': 'GQ',
  'N. Cyprus': 'CY', 'Somaliland': 'SO', 'Kosovo': 'XK', 'Macedonia': 'MK', 'North Macedonia': 'MK', 'Falkland Is.': 'FK',
  'Fr. S. Antarctic Lands': 'TF', "Côte d'Ivoire": 'CI', 'W. Sahara': 'EH', 'Timor-Leste': 'TL', 'Palestine': 'PS',
  'Taiwan': 'TW', 'Russia': 'RU', 'South Korea': 'KR', 'North Korea': 'KP', 'Laos': 'LA', 'Vietnam': 'VN', 'Syria': 'SY',
  'Congo': 'CG', 'Netherlands': 'NL', 'Iran': 'IR', 'Tanzania': 'TZ', 'Bolivia': 'BO', 'Venezuela': 'VE', 'Moldova': 'MD', 'Brunei': 'BN', 'Turkey': 'TR',
};

let geo; // loaded once
async function loadGeo() {
  if (geo) return geo;
  const places = JSON.parse(gunzipSync(await readFile(path.join(here, 'data', 'places.json.gz'))).toString('utf8'));
  const countryByName = {};
  for (const [code, name] of Object.entries(places.countries)) {
    countryByName[norm(name)] = code;
    countryByName[norm(code)] = code;
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) countryByName[alias] = code;

  const citiesByName = new Map();
  // Rows are [name, [other names], country, region code, lat, lng], most important places first.
  for (const [name, others, cc, a1, lat, lng] of places.cities) {
    for (const key of new Set([name, ...others].map(norm))) {
      if (!key) continue;
      if (!citiesByName.has(key)) citiesByName.set(key, []);
      citiesByName.get(key).push({ name, cc, a1, lat, lng });
    }
  }

  const topo = require('world-atlas/countries-110m.json');
  const land = feature(topo, topo.objects.countries);
  land.features = land.features.filter((f) => f.properties.name !== 'Antarctica');
  const projection = geoEqualEarth().fitWidth(WIDTH, land);
  const pathGen = geoPath(projection).digits(1);
  const height = Math.ceil(pathGen.bounds(land)[1][1]);
  const shapes = land.features.map((f) => {
    const name = f.properties.name;
    const code = MAP_NAME_FIXES[name] || countryByName[norm(name)] || '';
    return { code, d: pathGen(f) || '' };
  });
  // A more detailed outline, loaded by the browser only when someone zooms in.
  const topo50 = require('world-atlas/countries-50m.json');
  const land50 = feature(topo50, topo50.objects.countries);
  land50.features = land50.features.filter((f) => f.properties.name !== 'Antarctica');
  const detailPath = geoPath(projection).digits(1);
  const detailShapes = land50.features.map((f) => {
    const name = f.properties.name;
    return { code: MAP_NAME_FIXES[name] || countryByName[norm(name)] || '', d: detailPath(f) || '' };
  });
  geo = { places, countryByName, citiesByName, projection, height, shapes, detailShapes };
  return geo;
}

function resolve(g, entry, index) {
  const label = `orders-map.json, place ${index + 1}`;
  if (!entry || typeof entry.city !== 'string' || !entry.city.trim()) {
    return { warning: `${label}: needs a "city".` };
  }
  const cc = g.countryByName[norm(entry.country)];
  if (!cc) {
    return { warning: `${label} (${entry.city}): couldn't recognise the country "${entry.country ?? ''}". Use its English name, e.g. "United Kingdom", "USA", "Australia".` };
  }
  const country = g.places.countries[cc];
  const lat = Number(entry.lat), lng = Number(entry.lng);
  if (entry.lat !== undefined && entry.lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { city: entry.city.trim(), country, cc, lat, lng };
  }
  let matches = (g.citiesByName.get(norm(entry.city)) || []).filter((c) => c.cc === cc);
  if (entry.region && matches.length > 1) {
    const r = norm(entry.region);
    const inRegion = matches.filter((c) => norm(g.places.admin1[`${c.cc}.${c.a1}`]) === r || norm(c.a1) === r);
    if (inRegion.length) matches = inRegion;
  }
  if (!matches.length) {
    return {
      warning:
        `${label}: couldn't find "${entry.city}" in ${country}. Check the spelling, or add its coordinates, ` +
        `e.g. "lat": 53.48, "lng": -2.24 (in Google Maps, right-click the place and click the numbers at the top to copy them).`,
    };
  }
  const best = matches[0]; // the list is in order of size, so this is the biggest place with that name
  return { city: entry.city.trim(), country, cc, lat: best.lat, lng: best.lng };
}

export async function buildMap(data, originEntry) {
  const g = await loadGeo();
  const warnings = [];
  let origin = null;
  if (originEntry) {
    const o = resolve(g, originEntry, -1);
    if (o.warning) warnings.push(`The map's "origin" in home.json: ${o.warning.replace(/^[^:]*: /, '')}`);
    else origin = { ...o, label: originEntry.label || o.city };
  }
  const seen = new Map();
  (data.places || []).forEach((entry, i) => {
    const r = resolve(g, entry, i);
    if (r.warning) return warnings.push(r.warning);
    const key = `${r.cc}|${norm(r.city)}`;
    if (!seen.has(key)) seen.set(key, r);
  });
  const places = [...seen.values()].sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city));
  for (const p of [...places, ...(origin ? [origin] : [])]) [p.x, p.y] = g.projection([p.lng, p.lat]).map((v) => Math.round(v * 10) / 10);
  const visited = new Set(places.map((p) => p.cc));
  return {
    width: WIDTH,
    height: g.height,
    shapes: g.shapes.map((s) => ({ d: s.d, visited: visited.has(s.code) })),
    detailShapes: g.detailShapes.map((s) => ({ d: s.d, visited: visited.has(s.code) })),
    places,
    origin,
    countries: [...new Set(places.map((p) => p.country))],
    warnings,
  };
}
