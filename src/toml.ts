import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

const toml: DataFormat = {
  loadFile: async (path: PathLike | fs.FileHandle): Promise<StructuredData> => {
    const text = (await fs.readFile(path)).toString()
    return toml.from(text)
  },

  from: (text: string): StructuredData => {
    if (!text || text.trim().length === 0)
      throw new Error("Cannot parse empty or whitespace-only input")
    return new StructuredData(new TomlParser(text).parse(), "toml")
  },
}

class TomlError extends Error {
  constructor(msg: string, line: number, col: number) {
    super(`${msg} at line ${line}, column ${col}`)
    this.name = "TomlError"
  }
}

type TomlValue = string | number | boolean | TomlTable | TomlValue[] | Date
interface TomlTable {
  [key: string]: TomlValue
}
const INLINE_TABLE = Symbol("InlineTable")

class TomlParser {
  private idx = 0
  private line = 1
  private col = 1
  private root: TomlTable = {}
  private currentTable: TomlTable
  private definedTables = new Set<TomlTable>()

  constructor(private input: string) {
    this.currentTable = this.root
    this.definedTables.add(this.root)
  }

  parse = (): TomlTable => {
    while (this.idx < this.input.length) {
      this.skipIgnored()
      if (this.idx >= this.input.length) break
      if (this.peek() === "[") this.parseTableDecl()
      else this.parsePair()
    }
    return this.root
  }

  private peek = (n = 0): string => this.input[this.idx + n] || ""
  private advance = (n = 1) => {
    for (let i = 0; i < n && this.idx < this.input.length; i++) {
      if (this.input[this.idx++] === "\n") {
        this.line++
        this.col = 1
      } else this.col++
    }
  }
  private err = (msg: string) => {
    throw new TomlError(msg, this.line, this.col)
  }
  private match = (s: string) => this.input.startsWith(s, this.idx)

  private skipSpaces = () => {
    while (/[ \t]/.test(this.peek())) this.advance()
  }
  private skipIgnored = () => {
    while (this.idx < this.input.length) {
      const c = this.peek()
      if (/[ \t\r\n]/.test(c)) this.advance()
      else if (c === "#")
        while (this.idx < this.input.length && !/[\r\n]/.test(this.peek())) this.advance()
      else break
    }
  }

  private parseKeys = (): string[] => {
    const keys: string[] = []
    while (this.idx < this.input.length) {
      this.skipSpaces()
      keys.push(this.parseKey())
      this.skipSpaces()
      if (this.peek() === ".") {
        this.advance()
        continue
      }
      break
    }
    return keys
  }

  private parseKey = (): string => {
    const c = this.peek()
    // eslint-disable-next-line quotes
    if (c === '"' || c === "'") return this.parseString(false)
    let key = ""
    while (/[A-Za-z0-9_\-]/.test(this.peek())) {
      key += this.peek()
      this.advance()
    }
    if (!key) this.err("Expected key")
    return key
  }

  private parseTableDecl = () => {
    this.advance()
    const isArr = this.peek() === "["
    if (isArr) this.advance()
    const keys = this.parseKeys()
    if (this.peek() !== "]") this.err("Expected ']'")
    this.advance()
    if (isArr) {
      if (this.peek() !== "]") this.err("Expected ']]'")
      this.advance()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = this.root
    keys.forEach((key, i) => {
      const isLast = i === keys.length - 1
      if (isLast) {
        if (isArr) {
          if (!cur[key]) cur[key] = []
          if (!Array.isArray(cur[key])) this.err(`Key '${key}' is non-array`)
          const newT = {}
          cur[key].push(newT)
          this.currentTable = newT
        } else {
          if (cur[key]) {
            if (this.definedTables.has(cur[key])) this.err(`Table '${keys.join(".")}' redefined`)
            if (!this.isTable(cur[key])) this.err(`Key '${key}' is value`)
            this.currentTable = cur[key]
          } else {
            cur[key] = {}
            this.currentTable = cur[key]
          }
          this.definedTables.add(this.currentTable)
        }
      } else {
        if (!cur[key]) cur[key] = {}
        else if (!Array.isArray(cur[key]) && !this.isTable(cur[key]))
          this.err(`Key '${key}' not a table`)
        if (Array.isArray(cur[key])) cur = cur[key][cur[key].length - 1]
        else cur = cur[key]
      }
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isTable = (v: any) =>
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !(v as any)[INLINE_TABLE]

  private parsePair = () => {
    const keys = this.parseKeys()
    if (this.peek() !== "=") this.err("Expected '='")
    this.advance()
    this.skipSpaces()
    const val = this.parseValue()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = this.currentTable
    keys.forEach((key, i) => {
      if (i === keys.length - 1) {
        if (key in cur) this.err(`Duplicate key '${key}'`)
        cur[key] = val
      } else {
        if (!cur[key]) cur[key] = {}
        else if (!this.isTable(cur[key])) {
          if (cur[key][INLINE_TABLE]) this.err(`Cannot extend inline table '${key}'`)
          this.err(`Key '${key}' is value`)
        }
        cur = cur[key]
      }
    })
    this.skipSpaces()
    if (this.idx < this.input.length && this.peek() !== "#" && !/[\r\n]/.test(this.peek()))
      this.err("Expected newline/EOF")
  }

  private parseValue = (): TomlValue => {
    const c = this.peek()
    // eslint-disable-next-line quotes
    if (c === '"' || c === "'") return this.parseString(true)
    if (c === "t" || c === "f") return this.parseBool()
    if (c === "[") return this.parseArray()
    if (c === "{") return this.parseInlineTable()
    if (/[0-9]/.test(c)) {
      if (this.peek(4) === "-" && this.peek(7) === "-") return this.parseDate()
      if (this.peek(2) === ":") return this.parseTime()
    }
    if (/[0-9+\-in]/.test(c)) return this.parseNumber()
    this.err(`Unexpected '${c}'`)
    return ""
  }

  private parseDate = (): Date => {
    let s = ""
    while (/[0-9TZ.:\-+ \t]/.test(this.peek())) {
      s += this.peek()
      this.advance()
    }
    const d = new Date(s.replace(" ", "T"))
    if (isNaN(d.getTime())) this.err("Invalid date")
    return d
  }
  private parseTime = (): string => {
    let s = ""
    while (/[0-9:.]/.test(this.peek())) {
      s += this.peek()
      this.advance()
    }
    return s
  }

  private parseBool = (): boolean => {
    if (this.match("true")) {
      this.advance(4)
      return true
    }
    if (this.match("false")) {
      this.advance(5)
      return false
    }
    this.err("Invalid boolean")
    return false
  }

  private parseNumber = (): number => {
    if (this.match("inf") || this.match("+inf")) {
      this.advance(this.match("inf") ? 3 : 4)
      return Infinity
    }
    if (this.match("-inf")) {
      this.advance(4)
      return -Infinity
    }
    if (this.match("nan") || this.match("+nan")) {
      this.advance(this.match("nan") ? 3 : 4)
      return NaN
    }
    if (this.match("-nan")) {
      this.advance(4)
      return NaN
    }

    let s = ""
    if (/[+\-]/.test(this.peek())) {
      s += this.peek()
      this.advance()
    }
    if (this.peek() === "0" && /[xob]/.test(this.peek(1))) {
      if (s) this.err("Sign not allowed with hex/oct/bin")
      const t = this.peek(1)
      this.advance(2)
      let d = ""
      while (/[0-9A-Fa-f_]/.test(this.peek())) {
        if (this.peek() !== "_") d += this.peek()
        this.advance()
      }
      const v = parseInt(d, t === "x" ? 16 : t === "o" ? 8 : 2)
      if (isNaN(v)) this.err("Invalid integer")
      return v
    }
    while (/[0-9._eE+\-]/.test(this.peek())) {
      s += this.peek()
      this.advance()
    }
    if (
      !/^[+-]?(?:0|[1-9](?:_?[0-9])*)(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/.test(
        s,
      )
    )
      this.err(`Invalid number ${s}`)
    const n = parseFloat(s.replace(/_/g, ""))
    if (isNaN(n)) this.err("Invalid number")
    return n
  }

  private parseString = (multilineAllowed: boolean): string => {
    const start = this.peek()
    const isMulti = this.input.startsWith(start.repeat(3), this.idx)
    if (isMulti && !multilineAllowed) this.err("Multiline not allowed")
    const delim = isMulti ? start.repeat(3) : start
    this.advance(delim.length)
    if (isMulti && this.peek() === "\n") this.advance()
    else if (isMulti && this.peek() === "\r" && this.peek(1) === "\n") this.advance(2)

    let res = ""
    while (this.idx < this.input.length) {
      if (this.input.startsWith(delim, this.idx)) {
        if (isMulti) {
          let c = 0
          while (this.peek(c) === start && c < 5) c++
          if (c > 2) {
            this.advance(c)
            return res + start.repeat(c - 3)
          }
        } else {
          this.advance()
          return res
        }
      }
      const c = this.peek()
      if (!isMulti && /[\r\n]/.test(c)) this.err("Unterminated string")
      // eslint-disable-next-line quotes
      if (start === '"' && c === "\\") {
        this.advance()
        if (isMulti && /[ \t\r\n]/.test(this.peek())) {
          while (/[ \t\r\n]/.test(this.peek())) this.advance()
        } else res += this.parseEscape()
      } else {
        res += c
        this.advance()
      }
    }
    this.err("Unterminated string")
    return ""
  }

  private parseEscape = (): string => {
    const c = this.peek()
    this.advance()
    const escapes: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      // eslint-disable-next-line quotes
      '"': '"',
      "\\": "\\",
    }
    if (escapes[c]) return escapes[c]
    if (c === "u" || c === "U") {
      const len = c === "u" ? 4 : 8,
        code = this.input.substr(this.idx, len)
      this.advance(len)
      return String.fromCodePoint(parseInt(code, 16))
    }
    return c
  }

  private parseArray = (): TomlValue[] => {
    const arr: TomlValue[] = []
    this.advance()
    while (this.idx < this.input.length) {
      this.skipIgnored()
      if (this.peek() === "]") {
        this.advance()
        return arr
      }
      arr.push(this.parseValue())
      this.skipIgnored()
      if (this.peek() === ",") {
        this.advance()
        continue
      }
      if (this.peek() === "]") {
        this.advance()
        return arr
      }
      this.err("Expected ',' or ']'")
    }
    this.err("Unterminated array")
    return []
  }

  private parseInlineTable = (): TomlTable => {
    const t: TomlTable = {}
    Object.defineProperty(t, INLINE_TABLE, { value: true })
    this.advance()
    while (this.idx < this.input.length) {
      this.skipIgnored()
      if (this.peek() === "}") {
        this.advance()
        return t
      }
      const keys = this.parseKeys()
      this.skipIgnored()
      if (this.peek() !== "=") this.err("Expected '='")
      this.advance()
      this.skipIgnored()
      const val = this.parseValue()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let cur: any = t
      keys.forEach((key, i) => {
        if (i === keys.length - 1) cur[key] = val
        else {
          if (!cur[key]) {
            const n = {}
            Object.defineProperty(n, INLINE_TABLE, { value: true })
            cur[key] = n
          }
          cur = cur[key]
        }
      })
      this.skipIgnored()
      if (this.peek() === ",") {
        this.advance()
        continue
      }
      if (this.peek() === "}") {
        this.advance()
        return t
      }
      this.err("Expected ',' or '}'")
    }
    this.err("Unterminated inline table")
    return {}
  }
}

export default toml
