// Reading a weighing list or invoice specification the office picked as a file.

const MAX_FILE = 3 * 1024 * 1024;

/**
 * A weighing list file as text. Scale systems and Swedish Excel often save CSV as Windows-1252, so anything that
 * isn't valid UTF-8 is read as that instead (å, ä, ö would otherwise come out garbled).
 */
export async function readListFile(file) {
  if (/\.(xlsx?|ods|pdf)$/i.test(file.name)) {
    throw new Error('Spara listan som CSV (Arkiv → Spara som → CSV) eller kopiera raderna från Excel och klistra in dem.');
  }
  if (file.size > MAX_FILE) throw new Error('Filen är för stor (högst 3 MB). Dela upp listan per månad.');
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}
