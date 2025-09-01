import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

const csv: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return csv.from(text)
  },

  from: function (text: string): StructuredData {
    // Simple RFC4180-like CSV parser
    // - Fields separated by commas
    // - Fields may be quoted with double quotes
    // - Inside quoted fields, double quotes are escaped by repeating them
    // - CRLF or LF line endings supported

    const rows: string[][] = []
    const n = text.length
    let i = 0
    let field = ""
    let row: string[] = []
    let inQuotes = false

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
        if (c === "\r") {
          // skip CR, check for LF
          if (text[i + 1] === "\n") {
            i++
          }
          row.push(field)
          rows.push(row)
          row = []
          field = ""
          i++
          continue
        }

        if (c === "\n") {
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

    if (rows.length === 0) return new StructuredData([], "csv")

    const header = rows[0]
    const data = rows.slice(1).map((cols) => {
      const obj: Record<string, string> = {}
      for (let idx = 0; idx < header.length; idx++) {
        const key = header[idx] || `field${idx}`
        obj[key] = cols[idx] !== undefined ? cols[idx] : ""
      }
      return obj
    })

    return new StructuredData(data, "csv")
  },
}

export default csv
