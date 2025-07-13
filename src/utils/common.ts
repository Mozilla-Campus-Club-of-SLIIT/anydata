// credits: https://stackoverflow.com/a/4339083
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
    if ($1[0] === "#") {
      return String.fromCharCode(
        $1[1].toLowerCase() === "x" ? parseInt($1.substr(2), 16) : parseInt($1.substr(1), 10),
      )
    } else {
      return map.hasOwnProperty($1) ? map[$1] : $0
    }
  })
}

// credits: https://stackoverflow.com/a/55835813
export const compareArrays = (arr1: any[], arr2: any[]): boolean => {
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
