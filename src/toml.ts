import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

const toml: DataFormat = {
  loadFile: async (path: PathLike | fs.FileHandle): Promise<StructuredData> => {
    const text = (await fs.readFile(path)).toString()
    return toml.from(text)
  },

  from: (text: string): StructuredData => {
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot parse empty or whitespace-only input")
    }
    const parser = new TomlParser(text)
    const parsedData = parser.parse()
    return new StructuredData(parsedData, "toml")
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

// Symbol used to mark inline tables (cannot be extended after definition)
const INLINE_TABLE = Symbol("InlineTable")

class TomlParser {
  private idx: number
  private line: number
  private col: number
  private input: string
  private root: TomlTable
  private currentTable: TomlTable
  private definedTables: Set<TomlTable>
  // Stores references to arrays created via [[array]] syntax to differentiate from static arrays
  private arrayOfTables: Set<TomlValue[]>

  constructor(input: string) {
    this.input = input
    this.idx = 0
    this.line = 1
    this.col = 1
    this.root = {}
    this.currentTable = this.root
    this.definedTables = new Set<TomlTable>()
    this.definedTables.add(this.root)
    this.arrayOfTables = new Set<TomlValue[]>()
  }

  /**
   * Main parsing entry point. Processes the entire TOML document.
   * Returns the root table containing all parsed data.
   */
  parse(): TomlTable {
    const inputLength = this.input.length

    while (this.idx < inputLength) {
      this.skipIgnored()

      if (this.idx >= inputLength) {
        break
      }

      const currentChar = this.peek()
      if (currentChar === "[") {
        this.parseTableDecl()
      } else {
        this.parsePair()
      }
    }

    return this.root
  }

  /**
   * Peeks at a character in the input without consuming it.
   * Returns empty string if position is out of bounds.
   */
  private peek(offset: number = 0): string {
    const position = this.idx + offset
    if (position < this.input.length) {
      return this.input[position]
    }
    return ""
  }

  /**
   * Advances the parser position by n characters, tracking line and column numbers.
   */
  private advance(count: number = 1): void {
    const maxCount = 100000 // Safety limit for advance operations
    if (count > maxCount) {
      this.err("Internal error: advance count exceeds safety limit")
    }

    let i = 0
    while (i < count && this.idx < this.input.length) {
      const currentChar = this.input[this.idx]
      this.idx = this.idx + 1

      if (currentChar === "\n") {
        this.line = this.line + 1
        this.col = 1
      } else {
        this.col = this.col + 1
      }

      i = i + 1
    }
  }

  /**
   * Throws a TomlError with current line and column information.
   */
  private err(msg: string): never {
    throw new TomlError(msg, this.line, this.col)
  }

  /**
   * Checks if the input at current position starts with the given string.
   */
  private match(searchString: string): boolean {
    return this.input.startsWith(searchString, this.idx)
  }

  /**
   * Skips horizontal whitespace (spaces and tabs only).
   */
  private skipSpaces(): void {
    while (this.idx < this.input.length) {
      const currentChar = this.peek()
      const isSpace = currentChar === " " || currentChar === "\t"

      if (isSpace) {
        this.advance()
      } else {
        break
      }
    }
  }

  /**
   * Skips all ignorable content: whitespace and comments.
   * Comments start with # and continue to end of line.
   */
  private skipIgnored(): void {
    while (this.idx < this.input.length) {
      const currentChar = this.peek()
      const isWhitespace = /[ \t\r\n]/.test(currentChar)

      if (isWhitespace) {
        this.advance()
      } else if (currentChar === "#") {
        // Skip comment until end of line
        while (this.idx < this.input.length) {
          const commentChar = this.peek()
          const isNewline = /[\r\n]/.test(commentChar)
          if (isNewline) {
            break
          }
          this.advance()
        }
      } else {
        break
      }
    }
  }

  /**
   * Parses a sequence of keys separated by dots.
   * Example: "a.b.c" returns ["a", "b", "c"]
   */
  private parseKeys(): string[] {
    const keys: string[] = []
    const maxKeys = 1000 // Safety limit for nested keys

    while (this.idx < this.input.length && keys.length < maxKeys) {
      this.skipSpaces()
      const key = this.parseKey()
      keys.push(key)
      this.skipSpaces()

      const nextChar = this.peek()
      if (nextChar === ".") {
        this.advance()
        continue
      }

      break
    }

    if (keys.length >= maxKeys) {
      this.err("Too many nested keys")
    }

    return keys
  }

  /**
   * Parses a single key, which can be:
   * - Bare: alphanumeric, underscore, hyphen
   * - Quoted: single or double quotes
   */
  private parseKey(): string {
    const firstChar = this.peek()
    // prettier-ignore
    const isQuoted = firstChar === "\"" || firstChar === "'"

    if (isQuoted) {
      return this.parseString(false)
    }

    // Parse bare key
    let key = ""
    const maxKeyLength = 10000 // Safety limit for key length

    while (key.length < maxKeyLength) {
      const currentChar = this.peek()
      const isBareKeyChar = /[A-Za-z0-9_\-]/.test(currentChar)

      if (isBareKeyChar) {
        key = key + currentChar
        this.advance()
      } else {
        break
      }
    }

    if (key.length === 0) {
      this.err("Expected key")
    }

    if (key.length >= maxKeyLength) {
      this.err("Key too long")
    }

    return key
  }

  /**
   * Parses a table or array-of-tables declaration.
   * [table] is a standard table
   * [[array]] is an array of tables
   */
  private parseTableDecl(): void {
    this.advance() // Skip opening '['

    const isArrayOfTables = this.peek() === "["
    if (isArrayOfTables) {
      this.advance() // Skip second '['
    }

    const keys = this.parseKeys()

    // Expect closing bracket(s)
    if (this.peek() !== "]") {
      this.err("Expected ']'")
    }
    this.advance()

    if (isArrayOfTables) {
      if (this.peek() !== "]") {
        this.err("Expected ']]'")
      }
      this.advance()
    }

    // Navigate to the table location
    let current: TomlTable = this.root
    const keyCount = keys.length

    let i = 0
    while (i < keyCount) {
      const key = keys[i]
      const isLastKey = i === keyCount - 1

      if (isLastKey) {
        if (isArrayOfTables) {
          this.handleArrayOfTablesDeclaration(current, key, keys)
        } else {
          this.handleTableDeclaration(current, key, keys)
        }
      } else {
        // Navigate through intermediate keys
        current = this.navigateToIntermediateKey(current, key)
      }

      i = i + 1
    }
  }

  /**
   * Handles declaration of an array-of-tables ([[array]]).
   */
  private handleArrayOfTablesDeclaration(
    current: TomlTable,
    key: string,
    fullKeyPath: string[],
  ): void {
    // Initialize array if it doesn't exist
    if (!current[key]) {
      current[key] = []
      this.arrayOfTables.add(current[key] as TomlValue[])
    }

    // Verify it's an array
    const value = current[key]
    if (!Array.isArray(value)) {
      this.err(`Key '${key}' is non-array`)
    }

    // Verify the array was created via [[array]] syntax
    if (!this.arrayOfTables.has(value as TomlValue[])) {
      const fullPath = fullKeyPath.join(".")
      this.err(`Cannot append to statically defined array '${fullPath}'`)
    }

    // Create new table and append to array
    const newTable = {}
    ;(value as TomlValue[]).push(newTable)
    this.currentTable = newTable
  }

  /**
   * Handles declaration of a standard table ([table]).
   */
  private handleTableDeclaration(current: TomlTable, key: string, fullKeyPath: string[]): void {
    if (current[key]) {
      // Table already exists - check if we can use it
      const existingValue = current[key]

      if (this.isTable(existingValue)) {
        if (this.definedTables.has(existingValue)) {
          const fullPath = fullKeyPath.join(".")
          this.err(`Table '${fullPath}' redefined`)
        }
        this.currentTable = existingValue
      } else {
        this.err(`Key '${key}' is value`)
      }
    } else {
      // Create new table
      const newTable: TomlTable = {}
      current[key] = newTable
      this.currentTable = newTable
    }

    this.definedTables.add(this.currentTable)
  }

  /**
   * Navigates to an intermediate key in a dotted key path.
   * Creates tables as needed.
   */
  private navigateToIntermediateKey(current: TomlTable, key: string): TomlTable {
    if (!current[key]) {
      const newTable = {}
      current[key] = newTable
      return newTable
    }

    const existingValue = current[key]

    if (Array.isArray(existingValue)) {
      // Navigate into last element of array
      const lastIndex = existingValue.length - 1
      if (lastIndex < 0) {
        this.err(`Cannot navigate into empty array '${key}'`)
      }
      const lastElement = existingValue[lastIndex]

      if (this.isTable(lastElement)) {
        return lastElement
      }
      this.err(`Key '${key}' is not a table`)
    }

    if (!this.isTable(existingValue)) {
      this.err(`Key '${key}' not a table`)
    }

    return existingValue
  }

  /**
   * Checks if a value is a table (plain object, not array or Date or inline table).
   */
  private isTable(value: unknown): value is TomlTable {
    if (typeof value !== "object" || value === null) {
      return false
    }

    if (Array.isArray(value)) {
      return false
    }

    if (value instanceof Date) {
      return false
    }

    const hasInlineTableMarker = (value as Record<string | symbol, unknown>)[INLINE_TABLE]
    if (hasInlineTableMarker) {
      return false
    }

    return true
  }

  /**
   * Parses a key-value pair (key = value).
   */
  private parsePair(): void {
    const keys = this.parseKeys()

    if (this.peek() !== "=") {
      this.err("Expected '='")
    }
    this.advance()

    this.skipSpaces()
    const value = this.parseValue()

    // Navigate through keys and assign value
    let current: TomlTable = this.currentTable
    const keyCount = keys.length

    let i = 0
    while (i < keyCount) {
      const key = keys[i]
      const isLastKey = i === keyCount - 1

      if (isLastKey) {
        // Check for duplicate key
        const keyExists = key in current
        if (keyExists) {
          this.err(`Duplicate key '${key}'`)
        }
        current[key] = value
      } else {
        // Navigate or create intermediate tables
        const existing = current[key]

        if (!existing) {
          const newTable: TomlTable = {}
          current[key] = newTable
          current = newTable
        } else if (this.isTable(existing)) {
          current = existing
        } else {
          if (
            typeof existing === "object" &&
            existing !== null &&
            (existing as unknown as Record<string | symbol, unknown>)[INLINE_TABLE]
          ) {
            this.err(`Cannot extend inline table '${key}'`)
          }
          this.err(`Key '${key}' is value`)
        }
      }

      i = i + 1
    }

    // After a key-value pair, expect newline or EOF
    this.skipSpaces()
    const atEnd = this.idx >= this.input.length
    if (!atEnd) {
      const nextChar = this.peek()
      const isComment = nextChar === "#"
      const isNewline = /[\r\n]/.test(nextChar)

      if (!isComment && !isNewline) {
        this.err("Expected newline/EOF")
      }
    }
  }

  /**
   * Parses any TOML value based on the first character.
   */
  private parseValue(): TomlValue {
    const firstChar = this.peek()

    // String (quoted)
    // prettier-ignore
    const isQuote = firstChar === "\"" || firstChar === "'"
    if (isQuote) {
      return this.parseString(true)
    }

    // Boolean
    const isBoolStart = firstChar === "t" || firstChar === "f"
    if (isBoolStart) {
      return this.parseBool()
    }

    // Array
    if (firstChar === "[") {
      return this.parseArray()
    }

    // Inline table
    if (firstChar === "{") {
      return this.parseInlineTable()
    }

    // Date or time
    const isDigit = /[0-9]/.test(firstChar)
    if (isDigit) {
      // Check for date pattern (YYYY-MM-DD)
      const fourthChar = this.peek(4)
      const seventhChar = this.peek(7)
      const isDatePattern = fourthChar === "-" && seventhChar === "-"
      if (isDatePattern) {
        return this.parseDate()
      }

      // Check for time pattern (HH:MM)
      const secondChar = this.peek(2)
      const isTimePattern = secondChar === ":"
      if (isTimePattern) {
        return this.parseTime()
      }
    }

    // Number (including signed, infinity, nan)
    const isNumberStart = /[0-9+\-in]/.test(firstChar)
    if (isNumberStart) {
      return this.parseNumber()
    }

    this.err(`Unexpected '${firstChar}'`)
    return ""
  }

  /**
   * Parses a date or datetime value.
   */
  private parseDate(): Date {
    let dateString = ""
    const maxDateLength = 100 // Safety limit

    while (dateString.length < maxDateLength) {
      const currentChar = this.peek()
      const isDateChar = /[0-9TZ.:\-+ \t]/.test(currentChar)

      if (isDateChar) {
        dateString = dateString + currentChar
        this.advance()
      } else {
        break
      }
    }

    const trimmed = dateString.trim()

    // Check for local date format (YYYY-MM-DD only)
    const isLocalDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    if (isLocalDateOnly) {
      const isoString = trimmed + "T00:00:00Z"
      const date = new Date(isoString)
      if (isNaN(date.getTime())) {
        this.err("Invalid date")
      }
      return date
    }

    // Replace space with T for ISO format compatibility
    const normalized = dateString.replace(" ", "T")
    const date = new Date(normalized)

    if (isNaN(date.getTime())) {
      this.err("Invalid date")
    }

    return date
  }

  /**
   * Parses a local time value (HH:MM:SS or HH:MM:SS.fraction).
   */
  private parseTime(): Date {
    let timeString = ""
    const maxTimeLength = 100 // Safety limit

    while (timeString.length < maxTimeLength) {
      const currentChar = this.peek()
      const isTimeChar = /[0-9:.]/.test(currentChar)

      if (isTimeChar) {
        timeString = timeString + currentChar
        this.advance()
      } else {
        break
      }
    }

    // Use reference date (1970-01-01) for local time
    const isoString = "1970-01-01T" + timeString + "Z"
    const date = new Date(isoString)

    if (isNaN(date.getTime())) {
      this.err("Invalid time")
    }

    return date
  }

  /**
   * Parses a boolean value (true or false).
   */
  private parseBool(): boolean {
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

  /**
   * Parses a number value (integer, float, or special values like inf/nan).
   */
  private parseNumber(): number {
    // Handle special float values
    if (this.match("inf") || this.match("+inf")) {
      const length = this.match("inf") ? 3 : 4
      this.advance(length)
      return Infinity
    }

    if (this.match("-inf")) {
      this.advance(4)
      return -Infinity
    }

    if (this.match("nan") || this.match("+nan")) {
      const length = this.match("nan") ? 3 : 4
      this.advance(length)
      return NaN
    }

    if (this.match("-nan")) {
      this.advance(4)
      return NaN
    }

    // Parse regular number
    let numberString = ""

    // Optional sign
    const firstChar = this.peek()
    const hasSign = /[+\-]/.test(firstChar)
    if (hasSign) {
      numberString = numberString + firstChar
      this.advance()
    }

    // Check for hex, octal, or binary
    const isZero = this.peek() === "0"
    const hasBasePrefix = /[xob]/.test(this.peek(1))

    if (isZero && hasBasePrefix) {
      if (numberString.length > 0) {
        this.err("Sign not allowed with hex/oct/bin")
      }

      return this.parseIntegerWithBase()
    }

    // Parse decimal number
    return this.parseDecimalNumber(numberString)
  }

  /**
   * Parses an integer in hex, octal, or binary format.
   */
  private parseIntegerWithBase(): number {
    const baseChar = this.peek(1)
    this.advance(2) // Skip "0x", "0o", or "0b"

    let digits = ""
    const maxDigits = 1000 // Safety limit

    while (digits.length < maxDigits) {
      const currentChar = this.peek()
      const isValidChar = /[0-9A-Fa-f_]/.test(currentChar)

      if (isValidChar) {
        if (currentChar !== "_") {
          digits = digits + currentChar
        }
        this.advance()
      } else {
        break
      }
    }

    let base = 10
    if (baseChar === "x") {
      base = 16
    } else if (baseChar === "o") {
      base = 8
    } else if (baseChar === "b") {
      base = 2
    }

    const value = parseInt(digits, base)
    if (isNaN(value)) {
      this.err("Invalid integer")
    }

    return value
  }

  /**
   * Parses a decimal number (integer or float).
   */
  private parseDecimalNumber(prefix: string): number {
    let numberString = prefix
    const maxLength = 1000 // Safety limit

    while (numberString.length < maxLength) {
      const currentChar = this.peek()
      const isNumberChar = /[0-9._eE+\-]/.test(currentChar)

      if (isNumberChar) {
        numberString = numberString + currentChar
        this.advance()
      } else {
        break
      }
    }

    // Validate number format
    const validPattern =
      /^[+-]?(?:0|[1-9](?:_?[0-9])*)(?:\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?$/
    if (!validPattern.test(numberString)) {
      this.err(`Invalid number ${numberString}`)
    }

    // Remove underscores and parse
    const cleaned = numberString.replace(/_/g, "")
    const value = parseFloat(cleaned)

    if (isNaN(value)) {
      this.err("Invalid number")
    }

    return value
  }

  /**
   * Parses a string value (basic or literal, single-line or multi-line).
   */
  private parseString(multilineAllowed: boolean): string {
    const quoteChar = this.peek()
    const tripleQuote = quoteChar.repeat(3)
    const isMultiline = this.input.startsWith(tripleQuote, this.idx)

    if (isMultiline && !multilineAllowed) {
      this.err("Multiline not allowed")
    }

    const delimiter = isMultiline ? tripleQuote : quoteChar
    this.advance(delimiter.length)

    // Skip optional newline after opening delimiter in multiline strings
    if (isMultiline) {
      if (this.peek() === "\n") {
        this.advance()
      } else if (this.peek() === "\r" && this.peek(1) === "\n") {
        this.advance(2)
      }
    }

    return this.parseStringContent(quoteChar, delimiter, isMultiline)
  }

  /**
   * Parses the content of a string until the closing delimiter.
   */
  private parseStringContent(quoteChar: string, delimiter: string, isMultiline: boolean): string {
    let result = ""
    const maxLength = 1000000 // Safety limit

    while (this.idx < this.input.length && result.length < maxLength) {
      // Check for closing delimiter
      if (this.input.startsWith(delimiter, this.idx)) {
        if (isMultiline) {
          // Handle extra quotes in multiline strings (up to 5 total)
          const closingResult = this.handleMultilineStringClosing(quoteChar)
          if (closingResult !== null) {
            return result + closingResult
          }
        } else {
          this.advance()
          return result
        }
      }

      const currentChar = this.peek()

      // Single-line strings cannot contain unescaped newlines
      if (!isMultiline && /[\r\n]/.test(currentChar)) {
        this.err("Unterminated string")
      }

      // Handle escape sequences in basic strings (double quotes)
      // prettier-ignore
      const isBasicString = quoteChar === "\""
      const isEscape = currentChar === "\\"

      if (isBasicString && isEscape) {
        this.advance()
        const escaped = this.handleStringEscape(isMultiline)
        result = result + escaped
      } else {
        result = result + currentChar
        this.advance()
      }
    }

    this.err("Unterminated string")
    return ""
  }

  /**
   * Handles closing of multiline strings with extra quotes.
   * Returns extra quotes if found, or null to continue parsing.
   */
  private handleMultilineStringClosing(quoteChar: string): string | null {
    let quoteCount = 0
    const maxQuotes = 5

    while (quoteCount <= maxQuotes) {
      const charAtOffset = this.peek(quoteCount)
      if (charAtOffset === quoteChar) {
        quoteCount = quoteCount + 1
      } else {
        break
      }
    }

    if (quoteCount > 2) {
      this.advance(quoteCount)
      const extraQuotes = quoteCount - 3
      return quoteChar.repeat(extraQuotes)
    }

    return null
  }

  /**
   * Handles escape sequences in basic strings and line-ending backslash.
   */
  private handleStringEscape(isMultiline: boolean): string {
    const escapeChar = this.peek()

    // Line-ending backslash in multiline strings (trim whitespace)
    if (isMultiline && /[ \t\r\n]/.test(escapeChar)) {
      while (this.idx < this.input.length) {
        const currentChar = this.peek()
        const isWhitespace = /[ \t\r\n]/.test(currentChar)
        if (isWhitespace) {
          this.advance()
        } else {
          break
        }
      }
      return ""
    }

    return this.parseEscape()
  }

  /**
   * Parses a single escape sequence and returns the resulting character.
   */
  private parseEscape(): string {
    const escapeChar = this.peek()
    this.advance()

    // Common single-character escapes
    // prettier-ignore
    const escapeMap: Record<string, string> = {
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      e: "\x1B",
      "\"": "\"",
      "\\": "\\",
    }

    const mappedEscape = escapeMap[escapeChar]
    if (mappedEscape) {
      return mappedEscape
    }

    // Hex escape: \xHH
    if (escapeChar === "x") {
      return this.parseHexEscape(2)
    }

    // Unicode escape: \uHHHH
    if (escapeChar === "u") {
      return this.parseUnicodeEscape(4)
    }

    // Unicode escape: \UHHHHHHHH
    if (escapeChar === "U") {
      return this.parseUnicodeEscape(8)
    }

    this.err(`Invalid escape sequence '\\${escapeChar}'`)
    return ""
  }

  /**
   * Parses a hex escape sequence (\xHH).
   */
  private parseHexEscape(digitCount: number): string {
    const code = this.input.substr(this.idx, digitCount)
    const pattern = new RegExp(`^[0-9A-Fa-f]{${digitCount}}$`)

    if (!pattern.test(code)) {
      this.err("Invalid \\xHH escape sequence")
    }

    this.advance(digitCount)
    const codePoint = parseInt(code, 16)
    return String.fromCodePoint(codePoint)
  }

  /**
   * Parses a Unicode escape sequence (\uHHHH or \UHHHHHHHH).
   */
  private parseUnicodeEscape(digitCount: number): string {
    const code = this.input.substr(this.idx, digitCount)
    const pattern = new RegExp(`^[0-9A-Fa-f]{${digitCount}}$`)

    const escapeType = digitCount === 4 ? "\\uHHHH" : "\\UHHHHHHHH"
    if (!pattern.test(code)) {
      this.err(`Invalid ${escapeType} escape sequence`)
    }

    this.advance(digitCount)
    const codePoint = parseInt(code, 16)

    // Validate Unicode scalar value
    const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff
    const isOutOfRange = codePoint > 0x10ffff

    if (isSurrogate || isOutOfRange) {
      this.err("Invalid Unicode scalar value")
    }

    return String.fromCodePoint(codePoint)
  }

  /**
   * Parses an array value.
   */
  private parseArray(): TomlValue[] {
    const array: TomlValue[] = []
    this.advance() // Skip opening '['

    const maxElements = 100000 // Safety limit

    while (this.idx < this.input.length && array.length < maxElements) {
      this.skipIgnored()

      // Check for closing bracket
      if (this.peek() === "]") {
        this.advance()
        return array
      }

      // Parse array element
      const value = this.parseValue()
      array.push(value)

      this.skipIgnored()

      // Check for comma or closing bracket
      const nextChar = this.peek()
      if (nextChar === ",") {
        this.advance()
        continue
      }

      if (nextChar === "]") {
        this.advance()
        return array
      }

      this.err("Expected ',' or ']'")
    }

    this.err("Unterminated array")
    return []
  }

  /**
   * Parses an inline table value.
   */
  private parseInlineTable(): TomlTable {
    const table: TomlTable = {}
    Object.defineProperty(table, INLINE_TABLE, { value: true })

    this.advance() // Skip opening '{'

    const maxPairs = 10000 // Safety limit
    let pairCount = 0

    while (this.idx < this.input.length && pairCount < maxPairs) {
      this.skipIgnored()

      // Check for closing brace
      if (this.peek() === "}") {
        this.advance()
        return table
      }

      // Parse key-value pair
      const keys = this.parseKeys()
      this.skipIgnored()

      if (this.peek() !== "=") {
        this.err("Expected '='")
      }
      this.advance()

      this.skipIgnored()
      const value = this.parseValue()

      // Assign value using dotted key path
      this.assignInlineTableValue(table, keys, value)

      pairCount = pairCount + 1
      this.skipIgnored()

      // Check for comma or closing brace
      const nextChar = this.peek()
      if (nextChar === ",") {
        this.advance()
        continue
      }

      if (nextChar === "}") {
        this.advance()
        return table
      }

      this.err("Expected ',' or '}'")
    }

    this.err("Unterminated inline table")
    return {}
  }

  /**
   * Assigns a value in an inline table using a dotted key path.
   */
  private assignInlineTableValue(table: TomlTable, keys: string[], value: TomlValue): void {
    let current: TomlTable = table
    const keyCount = keys.length

    let i = 0
    while (i < keyCount) {
      const key = keys[i]
      const isLastKey = i === keyCount - 1

      if (isLastKey) {
        current[key] = value
      } else {
        // Create intermediate inline table if needed
        let next = current[key]

        if (!next) {
          const nestedTable: TomlTable = {}
          Object.defineProperty(nestedTable, INLINE_TABLE, { value: true })
          current[key] = nestedTable
          next = nestedTable
        }

        if (
          typeof next === "object" &&
          next !== null &&
          !Array.isArray(next) &&
          !(next instanceof Date)
        ) {
          current = next as TomlTable
        } else {
          this.err(`Key '${key}' is already defined as a value`)
        }
      }

      i = i + 1
    }
  }
}

export default toml
