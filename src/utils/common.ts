// credits: https://stackoverflow.com/a/4339083
/**
 * Turns HTML entities (like `&amp;` or `&#169;`) back into their real
 * characters so the rest of the code can work with normal strings. If we see an
 * entity we do not recognize, we just leave it alone instead of breaking data.
 */
export const replaceHTMLEntities = (str: string) => {
  const map: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    /* prettier-ignore */
    quot: "\"",
    apos: "'",
    nbsp: "\u00A0",
    cent: "¢",
    pound: "£",
    yen: "¥",
    euro: "€",
    copy: "©",
    reg: "®",
    trade: "™",
    hellip: "…",
    ndash: "–",
    mdash: "—",
    rsquo: "’",
    lsquo: "‘",
    ldquo: "“",
    rdquo: "”",
    sect: "§",
    deg: "°",
    plusmn: "±",
    para: "¶",
    middot: "·",
    bull: "•",
    sup1: "¹",
    sup2: "²",
    sup3: "³",
    frac14: "¼",
    frac12: "½",
    frac34: "¾",
    laquo: "«",
    raquo: "»",
    times: "×",
    divide: "÷",
  }

  return str.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);?/gi, function ($0, $1) {
    // Numeric entity: convert hexadecimal or decimal ahead of returning the glyph
    if ($1[0] === "#") {
      return String.fromCharCode(
        $1[1].toLowerCase() === "x" ? parseInt($1.substr(2), 16) : parseInt($1.substr(1), 10),
      )
    } else {
      // Named entity: fall back to original token if the map lacks a match
      return map.hasOwnProperty($1) ? map[$1] : $0
    }
  })
}

// credits: https://stackoverflow.com/a/55835813
/**
 * Checks whether two arrays contain the same items regardless of order. We sort
 * both arrays and then compare each position. Handy when comparing lists such
 * as CSV headers where order is not important.
 */
export const compareArrays = <T>(arr1: T[], arr2: T[]): boolean => {
  if (arr1.length !== arr2.length) return false

  // implement custom sort if necessary
  arr1.sort()
  arr2.sort()

  // use normal for loop so we can return immediately if not equal
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false
  }

  return true
}
