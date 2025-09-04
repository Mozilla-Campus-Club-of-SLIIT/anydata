import { promises as fs, PathLike } from "fs"
import DataFormat, { Options } from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

const parse = (text: string): string[][] => {
  // Simple RFC4180-like CSV parser
  // - Fields separated by commas
  // - Fields may be quoted with double quotes
  // - Inside quoted fields, double quotes are escaped by repeating them
  // - CRLF or LF line endings supported
  text = text.trim()

  const rows: string[][] = []
  const n = text.length
  let i = 0
  let field = ""
  let row: string[] = []
  let inQuotes = false
  let colCount: number = 0

  while (i < n) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1]
        if (next === '"') {
          // escaped quote
          field += '"'
          i += 2
          continue
        } else {
          // end quote
          inQuotes = false
          i++
          continue
        }
      } else {
        field += c
        i++
        continue
      }
    } else {
      if (c === '"') {
        inQuotes = true
        i++
        continue
      }

      if (c === ",") {
        row.push(field)
        field = ""
        i++
        continue
      }

      // handle CRLF and LF
      if (c === "\r" || c === "\n") {
        if (c === "\r" && text[i + 1] === "\n") i++ // skip LF in CRLF
        row.push(field)
        rows.push(row)
        row = []
        field = ""
        i++
        continue
      }


      field += c
      i++
    }
  }

  // push last field/row
  if (inQuotes) throw new SyntaxError("Unexpected EOF while inside quoted field")
  row.push(field)
  // if the file ends with an empty trailing newline, avoid pushing an extra empty row
  if (!(row.length === 1 && row[0] === "" && rows.length === 0 && n === 0)) {
    rows.push(row)
  }
  return rows
}

const finalize = (rows: string[][], header: boolean): StructuredData => {
  if (rows.length === 0) return new StructuredData([], "csv")

  const headerRow = header ? rows[0] : null
  if (!headerRow) return new StructuredData(rows, "csv")

  const data = rows.slice(header ? 1 : 0).map((cols) => {
    const obj: Record<string, string> = {}
    for (let idx = 0; idx < headerRow.length; idx++) {
      const key = headerRow[idx] || `field${idx}`
      obj[key] = cols[idx] !== undefined ? cols[idx] : ""
    }
    return obj
  })
  return new StructuredData(data, "csv")
}

const csv: DataFormat = {
  loadFile: async function (
    path: PathLike | fs.FileHandle,
    { header }: Options = { header: false },
  ): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return csv.from(text, { header })
  },

  from: function (text: string, { header }: Options = { header: false }): StructuredData {
    header = !!header
    const parsed = parse(text)
    return finalize(parsed, header)
  },
}

export default csv
