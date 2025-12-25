import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

// https://toml.io/en/v1.0.0
const toml: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return toml.from(text)
  },

  from: function (text: string): StructuredData {
    // Validate that input is not empty or whitespace-only
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot parse empty or whitespace-only input")
    }
    const parser = new TomlParser(text)
    return new StructuredData(parser.parse(), "toml")
  },
}

class TomlError extends Error {
  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = "TomlError"
  }
}

type TomlValue = string | number | boolean | TomlTable | TomlValue[] | Date
interface TomlTable {
  [key: string]: TomlValue
}

// Tokenizer Class (logic merged into Parser)

const INLINE_TABLE = Symbol("InlineTable")

class TomlParser {
  private input: string
  private idx: number = 0
  private line: number = 1
  private col: number = 1
  private root: TomlTable = {}
  private currentTable: TomlTable
  private explicitlyDefinedTables = new Set<TomlTable>()

  constructor(input: string) {
    this.input = input
    this.currentTable = this.root
    this.explicitlyDefinedTables.add(this.root)
  }

  parse(): TomlTable {
    while (this.idx < this.input.length) {
      this.consumeWhitespace()
      if (this.idx >= this.input.length) break

      const char = this.peek()

      if (char === "#") {
        this.consumeComment()
      } else if (char === "\n" || char === "\r") {
        this.consumeNewline()
      } else if (char === "[") {
        this.parseTableDeclaration()
      } else {
        this.parseKeyValuePair()
      }
    }
    return this.root
  }

  // --- Character Consumption & Helpers ---

  private peek(offset: number = 0): string {
    if (this.idx + offset >= this.input.length) return ""
    return this.input[this.idx + offset]
  }

  private advance(count: number = 1) {
    for (let i = 0; i < count; i++) {
      if (this.idx >= this.input.length) break
      const char = this.input[this.idx]
      if (char === "\n") {
        this.line++
        this.col = 1
      } else {
        this.col++
      }
      this.idx++
    }
  }

  private consumeWhitespace() {
    while (this.idx < this.input.length) {
      const char = this.peek()
      if (char === " " || char === "\t") {
        this.advance()
      } else {
        break
      }
    }
  }

  private consumeComment() {
    if (this.peek() !== "#") return
    while (this.idx < this.input.length) {
      const char = this.peek()
      if (char === "\n" || char === "\r") break
      this.advance()
    }
  }

  private consumeNewline() {
    const char = this.peek()
    if (char === "\r") {
      this.advance()
      if (this.peek() === "\n") {
        this.advance()
      }
    } else if (char === "\n") {
      this.advance()
    }
  }

  // --- Parsing Logic ---

  private parseTableDeclaration() {
    this.advance() // consume '['

    // Check for Array of Tables
    const isArrayOfTables = this.peek() === "["
    if (isArrayOfTables) {
      this.advance()

      // Parse key parts (dotted keys)
      const keys: string[] = []
      while (this.idx < this.input.length) {
        this.consumeWhitespace()
        keys.push(this.parseKey())
        this.consumeWhitespace()

        if (this.peek() === ".") {
          this.advance()
          continue
        } else if (this.peek() === "]") {
          this.advance()
          // Must handle double bracket ']]'
          if (this.peek() === "]") {
            this.advance()
            break
          } else {
            throw new TomlError("Expected ']]' for array of tables", this.line, this.col)
          }
        } else {
          throw new TomlError(
            "Expected '.' or ']]' in array of table declaration",
            this.line,
            this.col,
          )
        }
      }

      // Resolve table path
      let current: TomlValue = this.root
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const isLast = i === keys.length - 1

        if (isLast) {
          if (!(key in (current as TomlTable))) {
            ;(current as TomlTable)[key] = []
          }
          if (!Array.isArray((current as TomlTable)[key])) {
            throw new TomlError(
              `Key '${key}' is already defined as a non-array`,
              this.line,
              this.col,
            )
          }
          const newTable: TomlTable = {}
          ;((current as TomlTable)[key] as TomlValue[]).push(newTable)
          this.currentTable = newTable
        } else {
          if (key in (current as TomlTable)) {
            const val: TomlValue = (current as TomlTable)[key]
            if (Array.isArray(val)) {
              // If it's an array, we must be extending the last element of the array
              const lastItem: TomlValue = val[val.length - 1]
              if (!lastItem) {
                throw new TomlError("Cannot extend empty array", this.line, this.col)
              }
              current = lastItem
            } else if (typeof val === "object" && val !== null) {
              current = val
            } else {
              throw new TomlError(
                `Key '${key}' is not a table or array of tables`,
                this.line,
                this.col,
              )
            }
          } else {
            // Implicitly create table
            const newTable: TomlTable = {}
            ;(current as TomlTable)[key] = newTable
            current = newTable
          }
        }
      }
      return
    }

    // Parse key parts (dotted keys)
    const keys: string[] = []
    while (this.idx < this.input.length) {
      this.consumeWhitespace()
      keys.push(this.parseKey())
      this.consumeWhitespace()

      if (this.peek() === ".") {
        this.advance()
        continue
      } else if (this.peek() === "]") {
        this.advance()
        break
      } else {
        throw new TomlError("Expected '.' or ']' in table declaration", this.line, this.col)
      }
    }

    // Resolve table path
    let current: TomlValue = this.root
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const isLast = i === keys.length - 1

      if (key in (current as TomlTable)) {
        const val: TomlValue = (current as TomlTable)[key]

        // Handle arrays - navigate to the last element
        if (Array.isArray(val)) {
          if (val.length === 0) {
            throw new TomlError(
              `Cannot create subtable for empty array '${key}'`,
              this.line,
              this.col,
            )
          }
          const lastElement: TomlValue = val[val.length - 1]
          if (typeof lastElement !== "object" || lastElement === null) {
            throw new TomlError(
              `Cannot create subtable: array '${key}' contains non-table values`,
              this.line,
              this.col,
            )
          }
          current = lastElement
        } else if (
          typeof val !== "object" ||
          val === null ||
          val instanceof Date ||
          (val as Record<string | symbol, unknown>)[INLINE_TABLE]
        ) {
          // Check if collision with non-table or inline table
          throw new TomlError(
            `Key '${key}' is already defined as a value or inline table`,
            this.line,
            this.col,
          )
        } else {
          // It's a regular table
          if (isLast) {
            if (this.explicitlyDefinedTables.has(val)) {
              throw new TomlError(
                `Table '${keys.join(".")}' is already defined`,
                this.line,
                this.col,
              )
            }
            this.explicitlyDefinedTables.add(val)
            this.currentTable = val
          } else {
            current = val
          }
        }
      } else {
        const newTable: TomlTable = {}
        ;(current as TomlTable)[key] = newTable

        if (isLast) {
          this.explicitlyDefinedTables.add(newTable)
          this.currentTable = newTable
        } else {
          current = newTable
        }
      }
    }
  }

  private parseKeyValuePair() {
    // Parse key (possibly dotted)
    const keys: string[] = []
    while (this.idx < this.input.length) {
      this.consumeWhitespace()
      keys.push(this.parseKey())
      this.consumeWhitespace()

      if (this.peek() === ".") {
        this.advance()
        continue
      } else {
        break
      }
    }

    if (this.peek() !== "=") {
      throw new TomlError("Expected '=' after key", this.line, this.col)
    }
    this.advance() // consume '='
    this.consumeWhitespace()

    const value = this.parseValue()

    // Assign to current table with dot traversal
    let current: TomlValue = this.currentTable
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      const isLast = i === keys.length - 1

      if (isLast) {
        // Assign value
        if (key in (current as TomlTable)) {
          throw new TomlError(`Duplicate key '${key}'`, this.line, this.col)
        }
        ;(current as TomlTable)[key] = value
      } else {
        if (!(key in (current as TomlTable))) {
          ;(current as TomlTable)[key] = {}
        }
        const val: TomlValue = (current as TomlTable)[key]
        if (
          typeof val !== "object" ||
          val === null ||
          Array.isArray(val) ||
          (val as Record<string | symbol, unknown>)[INLINE_TABLE]
        ) {
          // Implicitly created tables must not conflict with inline tables or values
          // Note: If 'val' was an explicitly defined table, it's fine.
          // If it was an inline table, we cannot extend it.
          if ((val as Record<string | symbol, unknown>)[INLINE_TABLE]) {
            throw new TomlError(`Cannot extend inline table at '${key}'`, this.line, this.col)
          }
          if (typeof val !== "object") {
            throw new TomlError(`Key '${key}' is already defined as a value`, this.line, this.col)
          }
        }
        current = val
      }
    }

    // Expect newline or EOF
    this.consumeWhitespace()
    if (
      this.idx < this.input.length &&
      this.peek() !== "#" &&
      this.peek() !== "\n" &&
      this.peek() !== "\r"
    ) {
      throw new TomlError("Expected newline or EOF after value", this.line, this.col)
    }
  }

  private parseKey(): string {
    // Simple bare key or quoted key
    const char = this.peek()
    // eslint-disable-next-line quotes
    if (char === '"' || char === "'") {
      return this.parseString(false)
    } else {
      let key = ""
      while (this.idx < this.input.length) {
        const c = this.peek()
        if (/[A-Za-z0-9_\-]/.test(c)) {
          key += c
          this.advance()
        } else {
          break
        }
      }
      if (key.length === 0) {
        throw new TomlError("Expected key", this.line, this.col)
      }
      return key
    }
  }

  private parseValue(): TomlValue {
    const char = this.peek()
    // eslint-disable-next-line quotes
    if (char === '"' || char === "'") {
      return this.parseString(true)
    } else if (char === "t" || char === "f") {
      return this.parseBoolean()
    } else if (/[0-9+\-in]/.test(char)) {
      // Peek ahead to see if it looks like a date/time (RFC 3339)
      // Minimum date length is 10 chars: YYYY-MM-DD
      // Minimum time length is 8 chars: HH:MM:SS
      // But numbers can start with digit, +, -

      if (/[0-9]/.test(char)) {
        if (this.peek(4) === "-" && this.peek(7) === "-") {
          return this.parseDateOrDateTime()
        }
        // Check for time format: HH:MM or HH:MM:SS
        // Time format has colon at position 2 (after HH)
        if (this.peek(2) === ":") {
          return this.parseLocalTime()
        }
      }
      return this.parseNumber()
    } else if (char === "[") {
      return this.parseArray()
    } else if (char === "{") {
      return this.parseInlineTable()
    }

    throw new TomlError(`Unexpected character '${char}' for value`, this.line, this.col)
  }

  private parseDateOrDateTime(): Date | string {
    // Consume until whitespace or comment
    let dateStr = ""
    while (this.idx < this.input.length) {
      const c = this.peek()
      if (/[0-9TZ.:\-+ ]/.test(c)) {
        dateStr += c
        this.advance()
      } else {
        break
      }
    }

    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      throw new TomlError("Invalid date/time", this.line, this.col)
    }
    return date
  }

  private parseLocalTime(): string {
    // Local Time: 07:32:00
    let timeStr = ""
    while (this.idx < this.input.length) {
      const c = this.peek()
      if (/[0-9:.]/.test(c)) {
        timeStr += c
        this.advance()
      } else {
        break
      }
    }
    return timeStr
  }

  private parseString(allowMultiline: boolean = true): string {
    const startChar = this.peek()

    const isMultiline = this.input.startsWith(startChar.repeat(3), this.idx)

    if (isMultiline) {
      if (!allowMultiline) {
        throw new TomlError("Multi-line strings are not allowed here", this.line, this.col)
      }
      this.advance(3)

      if (this.peek() === "\n")
        this.advance() // Skip first newline
      else if (this.peek() === "\r" && this.peek(1) === "\n") this.advance(2)

      let result = ""

      while (this.idx < this.input.length) {
        if (this.input.startsWith(startChar.repeat(3), this.idx)) {
          // Check if it's 4 or 5 quotes (allowed)

          let quoteCount = 0

          while (this.peek(quoteCount) === startChar && quoteCount < 5) quoteCount++

          if (quoteCount === 3) {
            this.advance(3)

            return result
          } else if (quoteCount === 4) {
            // 4 quotes: first quote is content, last 3 are delimiter
            result += startChar
            this.advance(4)

            return result
          } else if (quoteCount === 5) {
            // 5 quotes: first 2 quotes are content, last 3 are delimiter
            result += startChar + startChar
            this.advance(5)

            return result
          }
        }

        const char = this.peek()

        // eslint-disable-next-line quotes
        if (startChar === '"' && char === "\\") {
          // Basic multi-line string escape handling

          this.advance()

          const escape = this.peek()

          if (escape === "\n" || escape === "\r" || escape === " " || escape === "\t") {
            // Trim whitespace until next non-whitespace char

            while (this.idx < this.input.length) {
              const c = this.peek()

              if (c === " " || c === "\t" || c === "\n" || c === "\r") {
                this.advance()
              } else {
                break
              }
            }
          } else {
            result += this.parseEscapeSequence()
          }
        } else {
          result += char

          this.advance()
        }
      }

      throw new TomlError("Unterminated multi-line string", this.line, this.col)
    }

    // Basic or Literal string

    this.advance() // consume opening delimiter

    const delimiter = startChar

    let result = ""

    while (this.idx < this.input.length) {
      const char = this.peek()

      if (char === delimiter) {
        this.advance() // consume closing delimiter

        return result
      }

      if (char === "\n" || char === "\r") {
        throw new TomlError("Unterminated string (newlines not allowed)", this.line, this.col)
      }

      // eslint-disable-next-line quotes
      if (char === "\\" && delimiter === '"') {
        this.advance()

        result += this.parseEscapeSequence()
      } else {
        result += char

        this.advance()
      }
    }

    throw new TomlError("Unterminated string", this.line, this.col)
  }

  private parseEscapeSequence(): string {
    const escape = this.peek()

    this.advance()

    switch (escape) {
      // eslint-disable-next-line quotes
      case '"':
        // eslint-disable-next-line quotes
        return '"'

      case "\\":
        return "\\"

      case "b":
        return "\b"

      case "f":
        return "\f"

      case "n":
        return "\n"

      case "r":
        return "\r"

      case "t":
        return "\t"

      case "u": {
        // 4-digit unicode

        const code = this.input.substring(this.idx, this.idx + 4)

        this.advance(4)

        return String.fromCharCode(parseInt(code, 16))
      }

      case "U": {
        // 8-digit unicode

        const code = this.input.substring(this.idx, this.idx + 8)

        this.advance(8)

        return String.fromCodePoint(parseInt(code, 16))
      }

      default:
        return escape
    }
  }

  private parseBoolean(): boolean {
    if (this.input.startsWith("true", this.idx)) {
      this.advance(4)
      return true
    }
    if (this.input.startsWith("false", this.idx)) {
      this.advance(5)
      return false
    }
    throw new TomlError("Invalid boolean", this.line, this.col)
  }

  private parseNumber(): number {
    // Check for special values first
    if (this.input.startsWith("inf", this.idx)) {
      this.advance(3)
      return Infinity
    }
    if (this.input.startsWith("+inf", this.idx)) {
      this.advance(4)
      return Infinity
    }
    if (this.input.startsWith("-inf", this.idx)) {
      this.advance(4)
      return -Infinity
    }
    if (this.input.startsWith("nan", this.idx)) {
      this.advance(3)
      return NaN
    }
    if (this.input.startsWith("+nan", this.idx)) {
      this.advance(4)
      return NaN
    }
    if (this.input.startsWith("-nan", this.idx)) {
      this.advance(4)
      return NaN
    }

    let sign = ""
    // Consume sign if present
    if (this.peek() === "+" || this.peek() === "-") {
      sign = this.peek()
      this.advance()
    }

    // Check for prefixes
    if (
      this.peek() === "0" &&
      (this.peek(1) === "x" || this.peek(1) === "o" || this.peek(1) === "b")
    ) {
      if (sign !== "") {
        throw new TomlError("Hex/Oct/Bin integers cannot have a sign", this.line, this.col)
      }
      const type = this.peek(1)
      this.advance(2) // consume 0x
      let digits = ""
      while (this.idx < this.input.length) {
        const c = this.peek()
        if (/[0-9A-Fa-f_]/.test(c)) {
          if (c !== "_") digits += c
          this.advance()
        } else {
          break
        }
      }
      let val = NaN
      if (type === "x") val = parseInt(digits, 16)
      else if (type === "o") val = parseInt(digits, 8)
      else if (type === "b") val = parseInt(digits, 2)

      if (isNaN(val)) throw new TomlError("Invalid integer", this.line, this.col)
      return val // Prefixes are unsigned
    }

    // Basic float/integer
    let raw = ""
    while (this.idx < this.input.length) {
      const c = this.peek()
      if (/[0-9._eE+\-]/.test(c)) {
        raw += c
        this.advance()
      } else {
        break
      }
    }

    // Strict Regex Validation
    const integerPart = "(?:0|[1-9](?:_?[0-9])*)"
    const fractionPart = "(?:\\.[0-9](?:_?[0-9])*)"
    const exponentPart = "(?:[eE][+-]?[0-9](?:_?[0-9])*)"
    const validNumRegex = new RegExp(`^${integerPart}(?:${fractionPart})?(?:${exponentPart})?$`)

    if (!validNumRegex.test(raw)) {
      throw new TomlError(`Invalid number format: ${sign}${raw}`, this.line, this.col)
    }

    const num = parseFloat(sign + raw.replace(/_/g, ""))
    if (isNaN(num)) throw new TomlError("Invalid number", this.line, this.col)
    return num
  }

  private parseArray(): TomlValue[] {
    const array: TomlValue[] = []
    this.advance() // consume '['

    while (this.idx < this.input.length) {
      // Consume whitespace, newlines, comments
      this.consumeWhitespaceAndComments()

      if (this.peek() === "]") {
        this.advance()
        return array
      }

      const value = this.parseValue()
      array.push(value)

      this.consumeWhitespaceAndComments()

      if (this.peek() === ",") {
        this.advance()
        continue // Continue to next value or closing bracket
      } else if (this.peek() === "]") {
        this.advance()
        return array
      } else {
        throw new TomlError("Expected comma or closing bracket in array", this.line, this.col)
      }
    }
    throw new TomlError("Unterminated array", this.line, this.col)
  }

  private consumeWhitespaceAndComments() {
    while (this.idx < this.input.length) {
      const char = this.peek()
      if (char === " " || char === "\t") {
        this.advance()
      } else if (char === "\n" || char === "\r") {
        this.consumeNewline()
      } else if (char === "#") {
        this.consumeComment()
      } else {
        break
      }
    }
  }

  private parseInlineTable(): TomlTable {
    const table: TomlTable = {}
    Object.defineProperty(table, INLINE_TABLE, { value: true })
    this.advance() // consume '{'

    while (this.idx < this.input.length) {
      this.consumeWhitespaceAndComments() // Allow newlines in inline tables (TOML 1.1.0)

      if (this.peek() === "}") {
        this.advance()
        return table
      }

      // Parse dotted keys in inline tables
      const keys: string[] = []
      while (this.idx < this.input.length) {
        this.consumeWhitespaceAndComments()
        keys.push(this.parseKey())
        this.consumeWhitespaceAndComments()

        if (this.peek() === ".") {
          this.advance()
          continue
        } else {
          break
        }
      }

      this.consumeWhitespaceAndComments()

      if (this.peek() !== "=") {
        throw new TomlError("Expected '=' in inline table", this.line, this.col)
      }
      this.advance()
      this.consumeWhitespaceAndComments()

      const value = this.parseValue()

      // Assign value using dotted key path
      let current: TomlValue = table
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i]
        const isLast = i === keys.length - 1

        if (isLast) {
          ;(current as TomlTable)[key] = value
        } else {
          if (!(key in (current as TomlTable))) {
            const nestedTable = {}
            Object.defineProperty(nestedTable, INLINE_TABLE, { value: true })
            ;(current as TomlTable)[key] = nestedTable
          }
          current = (current as TomlTable)[key]
        }
      }

      this.consumeWhitespaceAndComments()

      if (this.peek() === ",") {
        this.advance()
        continue
      } else if (this.peek() === "}") {
        this.advance()
        return table
      } else {
        throw new TomlError("Expected comma or closing brace in inline table", this.line, this.col)
      }
    }

    throw new TomlError("Unterminated inline table", this.line, this.col)
  }
}

export default toml
