// Parsea coordenada: DMS (positivo Norte/Este)
function parseCoordFlexible(str, which) {
  which = which || 'Coordenada';
  if (!str || !str.toString().trim()) throw `${which} vacío`;
  const s = str.toString().trim();

  const tokens = s.split(/\s+/);
  const hasHem = /[NSEWnsew]/.test(s);
  if (tokens.length === 4 && hasHem) {
    const g = parseFloat(tokens[0]), m = parseFloat(tokens[1]), sec = parseFloat(tokens[2]);
    const hemi = tokens[3].toUpperCase();
    if ([g, m, sec].some(isNaN)) throw `${which} DMS con número inválido`;
    let dec = g + m / 60 + sec / 3600;
    if (hemi === 'S' || hemi === 'W') dec *= -1;
    return dec;
  }
  const v = parseFloat(s);
  if (!isNaN(v)) return v;
  throw `${which} formato no reconocido`;
}

// WGS84 constants
const a = 6378137.0;
const f = 1 / 298.257223563;
const b = a * (1 - f);
const e2 = 2 * f - f * f;

// Lat/Lon (deg) + h -> ECEF
function llhToEcef(latDeg, lonDeg, h = 0) {
  const lat = latDeg * Math.PI / 180;
  const lon = lonDeg * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const x = (N + h) * Math.cos(lat) * Math.cos(lon);
  const y = (N + h) * Math.cos(lat) * Math.sin(lon);
  const z = (N * (1 - e2) + h) * Math.sin(lat);
  return { x, y, z };
}

// ECEF -> lat/lon/h
function ecefToLlh(x, y, z) {
  const lon = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));
  let prevLat = 0;
  let N = 0;
  let h = 0;
  let iter = 0;
  while (Math.abs(lat - prevLat) > 1e-12 && iter < 50) {
    prevLat = lat;
    const sinLat = Math.sin(lat);
    N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - e2 * (N / (N + h))));
    iter++;
  }
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI, h };
}

// ------------------------------
//  UTM (WGS84)  ← AGREGADO
// ------------------------------
function latLonToUTM(lat, lon) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;

  const e = Math.sqrt(f * (2 - f));
  const e2 = e * e;
  const ePrime2 = e2 / (1 - e2);

  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const zone = Math.floor((lon + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const T = Math.tan(latRad) ** 2;
  const C = ePrime2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lon0);

  const M =
    a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latRad));

  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ePrime2) * A ** 5 / 120)
    + 500000;

  let y = k0 * (M + N * Math.tan(latRad) *
    (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * ePrime2) * A ** 6 / 720));

  let hemi = "N";
  if (lat < 0) {
    y += 10000000;
    hemi = "S";
  }

  return { easting: x, northing: y, zone, hemisphere: hemi };
}

// ------------------------------
// ECEF -> ENU relativo a referencia
function ecefToEnu(x, y, z, lat0Deg, lon0Deg, x0, y0, z0) {
  const lat0 = lat0Deg * Math.PI / 180;
  const lon0 = lon0Deg * Math.PI / 180;
  const dx = x - x0, dy = y - y0, dz = z - z0;
  const sinLat = Math.sin(lat0), cosLat = Math.cos(lat0);
  const sinLon = Math.sin(lon0), cosLon = Math.cos(lon0);
  const tE = -sinLon * dx + cosLon * dy;
  const tN = -cosLon * sinLat * dx - sinLat * sinLon * dy + cosLat * dz;
  const tU = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;
  return { e: tE, n: tN, u: tU };
}

// ENU -> ECEF
function enuToEcef(e, n, u, lat0Deg, lon0Deg, x0, y0, z0) {
  const lat0 = lat0Deg * Math.PI / 180;
  const lon0 = lon0Deg * Math.PI / 180;
  const sinLat = Math.sin(lat0), cosLat = Math.cos(lat0);
  const sinLon = Math.sin(lon0), cosLon = Math.cos(lon0);
  const dx = -sinLon * e - cosLon * sinLat * n + cosLon * cosLat * u;
  const dy = cosLon * e - sinLon * sinLat * n + sinLon * cosLat * u;
  const dz = cosLat * n + sinLat * u;
  return { x: x0 + dx, y: y0 + dy, z: z0 + dz };
}

// ------------------------------
// GN 2D
function vec2norm(x, y) { return Math.sqrt(x * x + y * y); }

function solveGaussNewton2D(xi, yi, ri, init, maxIter = 100, tol = 1e-6) {
  if (!Array.isArray(xi) || xi.length < 3) throw "Necesitas al menos 3 puntos conocidos (xi,yi,ri).";
  let x = init.x, y = init.y;
  for (let iter = 0; iter < maxIter; iter++) {
    const Np = xi.length;
    let JtJ00 = 0, JtJ01 = 0, JtJ11 = 0;
    let Jtf0 = 0, Jtf1 = 0;
    const residuals = new Array(Np);

    for (let i = 0; i < Np; i++) {
      const dx = x - xi[i], dy = y - yi[i];
      const di = Math.sqrt(dx * dx + dy * dy);
      const inv = di === 0 ? 0 : 1 / di;
      const fi = di - ri[i];
      residuals[i] = fi;
      const Ji0 = dx * inv;
      const Ji1 = dy * inv;
      JtJ00 += Ji0 * Ji0;
      JtJ01 += Ji0 * Ji1;
      JtJ11 += Ji1 * Ji1;
      Jtf0 += Ji0 * fi;
      Jtf1 += Ji1 * fi;
    }

    const JtJ10 = JtJ01;
    const det = JtJ00 * JtJ11 - JtJ01 * JtJ10;
    if (Math.abs(det) < 1e-12) {
      return { x, y, rms: Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / residuals.length), iter, converged: false };
    }

    const inv00 = JtJ11 / det;
    const inv01 = -JtJ01 / det;
    const inv10 = -JtJ10 / det;
    const inv11 = JtJ00 / det;
    const deltaX = inv00 * Jtf0 + inv01 * Jtf1;
    const deltaY = inv10 * Jtf0 + inv11 * Jtf1;

    x -= deltaX;
    y -= deltaY;

    if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) < tol) {
      const rms = Math.sqrt(residuals.reduce((s, v) => s + v * v, 0) / residuals.length);
      return { x, y, rms, iter: iter + 1, converged: true };
    }
  }
  const residualsFinal = xi.map((_, i) => vec2norm(x - xi[i], y - yi[i]) - ri[i]);
  const rms = Math.sqrt(residualsFinal.reduce((s, v) => s + v * v, 0) / residualsFinal.length);
  return { x, y, rms, iter: maxIter, converged: false };
}

// ------------------------------
// MAPA
const map = (typeof L !== 'undefined' && document.getElementById('mapid')) 
  ? L.map('mapid', { zoomControl: true }).setView([20.6453, -98.6614], 17) 
  : null;

if (map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
}

let layerGroup = (map) 
  ? L.featureGroup().addTo(map) 
  : { 
      clearLayers: () => {}, 
      addLayer: () => {}, 
      getBounds: () => ({ isValid: () => false }), 
      getLayers: () => [] 
    };

// ------------------------------
// MAIN
const calcBtn = document.getElementById('calcBtn');
if (calcBtn) {
  calcBtn.addEventListener('click', () => {
    const out = document.getElementById('info');
    if (layerGroup && layerGroup.clearLayers) layerGroup.clearLayers();

    try {
      const p1_lat_s = document.getElementById('p1_lat').value;
      const p1_lon_s = document.getElementById('p1_lon').value;
      const p2_lat_s = document.getElementById('p2_lat').value;
      const p2_lon_s = document.getElementById('p2_lon').value;
      const p3_lat_s = document.getElementById('p3_lat').value;
      const p3_lon_s = document.getElementById('p3_lon').value;
      const d1 = parseFloat(document.getElementById('d1').value);
      const d2 = parseFloat(document.getElementById('d2').value);
      const d3 = parseFloat(document.getElementById('d3').value);

      if ([p1_lat_s, p1_lon_s, p2_lat_s, p2_lon_s, p3_lat_s, p3_lon_s].some(s => !s)) throw "Rellena las 3 coordenadas (lat/lon).";
      if ([d1, d2, d3].some(v => isNaN(v) || v <= 0)) throw "Ingresa las 3 distancias en metros (números > 0).";

      const lat1 = parseCoordFlexible(p1_lat_s, 'P1 lat');
      const lon1 = parseCoordFlexible(p1_lon_s, 'P1 lon');
      const lat2 = parseCoordFlexible(p2_lat_s, 'P2 lat');
      const lon2 = parseCoordFlexible(p2_lon_s, 'P2 lon');
      const lat3 = parseCoordFlexible(p3_lat_s, 'P3 lat');
      const lon3 = parseCoordFlexible(p3_lon_s, 'P3 lon');

      const refEcef = llhToEcef(lat1, lon1, 0);

      const P1_ecef = llhToEcef(lat1, lon1, 0);
      const P2_ecef = llhToEcef(lat2, lon2, 0);
      const P3_ecef = llhToEcef(lat3, lon3, 0);

      const p1_enu = ecefToEnu(P1_ecef.x, P1_ecef.y, P1_ecef.z, lat1, lon1, refEcef.x, refEcef.y, refEcef.z);
      const p2_enu = ecefToEnu(P2_ecef.x, P2_ecef.y, P2_ecef.z, lat1, lon1, refEcef.x, refEcef.y, refEcef.z);
      const p3_enu = ecefToEnu(P3_ecef.x, P3_ecef.y, P3_ecef.z, lat1, lon1, refEcef.x, refEcef.y, refEcef.z);

      const xi = [p1_enu.e, p2_enu.e, p3_enu.e];
      const yi = [p1_enu.n, p2_enu.n, p3_enu.n];
      const ri = [d1, d2, d3];

      let sumw = 0, x0 = 0, y0 = 0;
      for (let i = 0; i < 3; i++) {
        const w = 1 / Math.max(ri[i], 1e-3);
        sumw += w; x0 += xi[i] * w; y0 += yi[i] * w;
      }
      x0 /= sumw; y0 /= sumw;

      const sol = solveGaussNewton2D(xi, yi, ri, { x: x0, y: y0 }, 200, 1e-7);

      const solEcef = enuToEcef(sol.x, sol.y, 0, lat1, lon1, refEcef.x, refEcef.y, refEcef.z);
      const solLlh = ecefToLlh(solEcef.x, solEcef.y, solEcef.z);

      const latOut = solLlh.lat;
      const lonOut = solLlh.lon;
      const rms = sol.rms;

      // -------------------------------------
      // CONVERTIR A UTM  ← AGREGADO
      // -------------------------------------
      const utm = latLonToUTM(latOut, lonOut);

      out.innerHTML = `
        <b>Resultado:</b><br>
        Latitud: <b>${latOut.toFixed(7)}</b><br>
        Longitud: <b>${lonOut.toFixed(7)}</b><br><br>

        <b>UTM:</b><br>
        Zona: <b>${utm.zone}${utm.hemisphere}</b><br>
        Este (E): <b>${utm.easting.toFixed(3)}</b><br>
        Norte (N): <b>${utm.northing.toFixed(3)}</b><br><br>

        RMS residual (m): <b>${rms.toFixed(3)}</b><br>
        Iteraciones: <b>${sol.iter}</b> — Convergió: <b>${sol.converged}</b>
      `;

      const mapsLink = document.getElementById('mapsLink');
      if (mapsLink) {
        mapsLink.href = `https://www.google.com/maps/?q=${latOut.toFixed(7)},${lonOut.toFixed(7)}`;
        mapsLink.textContent = 'Abrir en Google Maps';
      }

      if (map) {
        L.circleMarker([lat1, lon1], { radius: 6 }).bindPopup('P1 (ref)').addTo(layerGroup);
        L.circleMarker([lat2, lon2], { radius: 6 }).bindPopup('P2').addTo(layerGroup);
        L.circleMarker([lat3, lon3], { radius: 6 }).bindPopup('P3').addTo(layerGroup);

        L.circle([lat1, lon1], { radius: d1, weight: 2 }).addTo(layerGroup);
        L.circle([lat2, lon2], { radius: d2, weight: 2 }).addTo(layerGroup);
        L.circle([lat3, lon3], { radius: d3, weight: 2 }).addTo(layerGroup);

        L.marker([latOut, lonOut], { title: 'Solución' })
          .bindPopup(`Árbol<br>${latOut.toFixed(7)}, ${lonOut.toFixed(7)}<br>RMS: ${rms.toFixed(3)} m`)
          .addTo(layerGroup);

        const groupBounds = layerGroup.getBounds();
        if (groupBounds.isValid()) map.fitBounds(groupBounds.pad(0.6));
      }
    }
    catch (err) {
      const infoEl = document.getElementById('info');
      if (infoEl) infoEl.innerHTML = `<span style="color:#ffb4b4"><b>Error:</b> ${err}</span>`;
      else console.error("Error:", err);
    }
  });
} else {
  console.warn("Botón #calcBtn no encontrado; el listener no está registrado.");
}

// ------------------------------
// BOTÓN LIMPIAR
const clearBtn = document.getElementById("clearBtn");

if (clearBtn) {
  clearBtn.addEventListener("click", () => {

    const infoEl = document.getElementById("info");
    infoEl.innerHTML = "Resultado aparecerá aquí.";

    const mapsLink = document.getElementById("mapsLink");
    if (mapsLink) {
      mapsLink.removeAttribute("href");
      mapsLink.textContent = "Abrir en Google Maps";
    }

    if (layerGroup && layerGroup.clearLayers) {
      layerGroup.clearLayers();
    }

    document.getElementById('p1_lat').value = "";
    document.getElementById('p1_lon').value = "";
    document.getElementById('d1').value = "";

    document.getElementById('p2_lat').value = "";
    document.getElementById('p2_lon').value = "";
    document.getElementById('d2').value = "";

    document.getElementById('p3_lat').value = "";
    document.getElementById('p3_lon').value = "";
    document.getElementById('d3').value = "";
  });
} else {
  console.warn("Botón #clearBtn no encontrado; el listener de limpiar no está activo.");
}
