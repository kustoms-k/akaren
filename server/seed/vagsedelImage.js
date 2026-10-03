import sharp from 'sharp';

// Renders a fictional weighbridge ticket (vågsedel) as a phone-photo-like JPEG for the demo seed.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const kg = (n) => `${new Intl.NumberFormat('sv-SE').format(n).replace(/ /g, ' ')} kg`;
const ewc = (code) => (code ? `${code.slice(0, 2)} ${code.slice(2, 4)} ${code.slice(4)}` : '');

/** SVG of a ticket. data: { facility:{namn,adress,orgnr}, nr, datum, tid, regnr, kund, marking, material, avfallskod, farligt, brutto, tara, netto } */
export function vagsedelSvg(d) {
  const lines = [
    ['VÅGSEDEL', `Nr ${d.nr}`, 30, true],
    ['Datum', `${d.datum}   Tid ${d.tid}`, 24],
    ['Fordon', d.regnr.replace(/^([A-Z]{3})/, '$1 '), 24],
    ['Kund', d.kund, 24],
    ...(d.marking ? [['Märkning', d.marking, 24]] : []),
    ['Artikel', d.material, 24],
    ...(d.avfallskod ? [['Avfallskod', `${ewc(d.avfallskod)}${d.farligt ? '*' : ''}`, 24]] : []),
  ];
  let y = 330;
  const rows = lines.map(([label, value, size, bold]) => {
    const row = `<text x="150" y="${y}" font-size="${size}" ${bold ? 'font-weight="bold"' : ''}>${esc(label)}</text>`
      + `<text x="${bold ? 470 : 360}" y="${y}" font-size="${size}" ${bold ? 'font-weight="bold"' : ''}>${esc(value)}</text>`;
    y += bold ? 64 : 46;
    return row;
  }).join('\n');
  const wy = y + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1250">
  <rect width="900" height="1250" fill="#cfc9be"/>
  <g transform="rotate(-1.4 450 625)" font-family="Courier New, Courier, monospace" fill="#222">
    <rect x="110" y="70" width="680" height="1110" fill="#fbfaf5" stroke="#d6d2c8" stroke-width="2"/>
    <text x="150" y="150" font-size="34" font-weight="bold">${esc(d.facility.namn)}</text>
    <text x="150" y="190" font-size="20">${esc(d.facility.adress)}</text>
    ${d.facility.orgnr ? `<text x="150" y="220" font-size="20">Org.nr ${esc(d.facility.orgnr)}</text>` : ''}
    <line x1="150" y1="255" x2="750" y2="255" stroke="#222" stroke-width="2" stroke-dasharray="8 6"/>
    ${rows}
    ${d.farligt ? `<text x="150" y="${y}" font-size="26" font-weight="bold">FARLIGT AVFALL</text>` : ''}
    <line x1="150" y1="${wy}" x2="750" y2="${wy}" stroke="#222" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="150" y="${wy + 60}" font-size="26">Brutto</text><text x="750" y="${wy + 60}" font-size="26" text-anchor="end">${kg(d.brutto)}</text>
    <text x="150" y="${wy + 110}" font-size="26">Tara</text><text x="750" y="${wy + 110}" font-size="26" text-anchor="end">${kg(d.tara)}</text>
    <text x="150" y="${wy + 175}" font-size="32" font-weight="bold">NETTO</text><text x="750" y="${wy + 175}" font-size="32" font-weight="bold" text-anchor="end">${kg(d.netto)}</text>
    <line x1="150" y1="${wy + 215}" x2="750" y2="${wy + 215}" stroke="#222" stroke-width="2" stroke-dasharray="8 6"/>
    <text x="150" y="${wy + 265}" font-size="18">Vägt på kontrollerad våg. Spara vågsedeln.</text>
  </g>
</svg>`;
}

/** JPEG bytes of the ticket. blur=true imitates a shaky phone photo (for the low-confidence demo rows). */
export async function renderVagsedel(data, { blur = false } = {}) {
  let img = sharp(Buffer.from(vagsedelSvg(data)));
  if (blur) img = img.blur(2.2);
  return img.jpeg({ quality: 80 }).toBuffer();
}
