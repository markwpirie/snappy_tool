// Small words that stay lowercase in Title Case unless they're the caption's
// very first word: articles, coordinating conjunctions, short prepositions,
// and every form of "to be". "up"/"down" are included even though a real
// report caption capitalized "Coiled-Up" — that's fine, hyphenated compounds
// (see hyphenParts below) are exempt from this list entirely, so standalone
// "up"/"down" lowercase while "Coiled-Up" still doesn't.
const STOPWORDS = new Set([
  'a', 'am', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'but', 'by',
  'down', 'for', 'from', 'if', 'in', 'into', 'is', 'nor', 'of', 'off', 'on', 'onto',
  'or', 'out', 'over', 'per', 'so', 'than', 'that', 'the', 'to', 'up', 'via', 'was', 'were', 'with', 'yet',
]);

// Words that can't be told apart from an ordinary word by shape alone, so
// they're listed explicitly and normalized to this casing regardless of how
// they were typed (unlike everything else here, which only *preserves*
// whatever signal is already in the input). Matched case-insensitively, one
// whitespace-token at a time — no multi-word phrases.
// Exd/Exe/Exi/Exn/Exm/Exp are IEC 60079 explosion-protection markings; Em is
// short for Emergency; AFT/ATC/JB are recurring rig tags that are easy to
// type casually in lowercase. Extend this list as more turn up.
export const DEFAULT_WHITELIST = ['Exd', 'Exe', 'Exi', 'Exn', 'Exm', 'Exp', 'Em', 'AFT', 'ATC', 'JB'];

const isDigit = (ch) => ch >= '0' && ch <= '9';
const isUpper = (ch) => ch !== ch.toLowerCase() && ch === ch.toUpperCase();
const isLetter = (ch) => ch.toLowerCase() !== ch.toUpperCase();

// True if `token` (one whitespace-delimited chunk, punctuation and all)
// should be left exactly as typed: it contains a digit (drawing numbers,
// ratings — "WCE-ES-158-C19-0001-01-00D", "440V", "no.1"), or its letters are
// all uppercase (acronyms/tags — "ATC", "(AFT)", a lone "B"), or it has an
// uppercase letter after its first letter (camelCase-style tags — "EnviroUnit",
// "E.Stops") — ordinary English words never do that.
function isProtected(token) {
  let sawDigit = false;
  let sawLetter = false;
  let sawLowercase = false;
  let firstLetterSeen = false;
  let upperAfterFirst = false;
  for (const ch of token) {
    if (isDigit(ch)) sawDigit = true;
    if (isLetter(ch)) {
      sawLetter = true;
      if (isUpper(ch)) {
        if (firstLetterSeen) upperAfterFirst = true;
      } else {
        sawLowercase = true;
      }
      firstLetterSeen = true;
    }
  }
  if (sawDigit) return true;
  if (sawLetter && !sawLowercase) return true; // all-caps (or no lowercase letters at all)
  if (upperAfterFirst) return true;
  return false;
}

// Splits off leading/trailing punctuation around the letters, e.g. "(AFT)," ->
// ["(", "AFT", "),"]. Internal punctuation ("E.Stops") stays inside `word`.
function splitAffixes(part) {
  const m = part.match(/^([^A-Za-z]*)([A-Za-z].*?)([^A-Za-z]*)$/);
  return m ? [m[1], m[2], m[3]] : null;
}

function titleCasePart(part) {
  const affixes = splitAffixes(part);
  if (!affixes) return part;
  const [lead, word, trail] = affixes;
  return lead + word[0].toUpperCase() + word.slice(1).toLowerCase() + trail;
}

function lowerPart(part) {
  return part.toLowerCase();
}

// Proper-cases a caption for the Word export: Title Case for ordinary words
// (small words like "for"/"to"/"at" stay lowercase unless they open the
// caption), while drawing numbers, ratings, acronyms, and known abbreviations
// are preserved exactly as typed. Pure/tested against real report captions —
// see captionCase.test.js.
export function properCaseCaption(text, extraWhitelist = []) {
  if (!text) return text;
  const whitelist = new Map(
    [...DEFAULT_WHITELIST, ...extraWhitelist].map((w) => [w.toLowerCase(), w])
  );

  const tokens = text.split(/(\s+)/); // keep whitespace runs so spacing is preserved
  let isFirstWord = true;

  const out = tokens.map((token) => {
    if (/^\s*$/.test(token)) return token;

    if (isProtected(token)) {
      isFirstWord = false;
      return token;
    }

    const affixes = splitAffixes(token);
    const wordLower = affixes ? affixes[1].toLowerCase() : '';
    if (whitelist.has(wordLower)) {
      isFirstWord = false;
      return affixes[0] + whitelist.get(wordLower) + affixes[2];
    }

    // Hyphenated compounds ("Coiled-Up"): every part is Title Cased, the
    // small-word exception only applies at the whole-token level.
    const hyphenParts = token.split('-');
    const wordIsStop = hyphenParts.length === 1 && STOPWORDS.has(wordLower);
    const result = !isFirstWord && wordIsStop
      ? lowerPart(token)
      : hyphenParts.map(titleCasePart).join('-');

    isFirstWord = false;
    return result;
  });

  return out.join('');
}
