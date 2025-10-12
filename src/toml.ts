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
    const tokenizer = new TomlTokenizer(text);
    for (const n of tokenizer.tokenize()) console.log(n)
    // const parser = new TomlParser(tokenizer.tokenize());
    return new StructuredData({}, "toml")
  }
}

// Tokenizer Class
class TomlTokenizer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  // tracker used in: @parseKeyValue
  private previousWasAKey: boolean = false;


  constructor(input: string) {
    this.input = input;
  }

  *tokenize(): IterableIterator<Token> {
    while (this.position < this.input.length) {
      // skip whitespace
      while (/[ \t]/.test(this.current())) this.step();

      if (this.position >= this.input.length) break;

      // skip comments
      if (this.current() === '#' && this.previous() !== "'" && this.previous() !== '"') while (this.current() !== '\n') {
        this.step();
        continue;
      }

      // handle newlines
      if (this.current() === '\n' || this.current() === '\r') {
        this.step();
        continue;
      }

      switch (this.current()) {
        case '=':
          const equalsToken = this.createToken(TokenType.EQUALS, '=');
          this.step();
          yield equalsToken;
          break;

        default:
          yield this.parseKeyValue();
          break;
      }
    }
    return;
  }

  private current = () => this.input[this.position];
  private previous = () => this.input[this.position - 1];
  private step = () => {
    if (this.current() === '\n') {
      this.line++;
      this.column = 1;
    }
    else this.column++;
    this.position++;
  }
  private parseKeyValue = (): Token => {
    const startPos = this.position;
    const startLine = this.line;
    const startCol = this.column;

    let value = "";
    let inString = false;
    let stringDelimiter = '';

    // Collect characters until we hit a delimiter
    while (this.position < this.input.length) {
      const currentChar = this.current();

      if (inString) {
        if (currentChar === stringDelimiter) {
          inString = false;
          value += currentChar;
          this.step();
          break;
        }
        value += currentChar;
        this.step();
        continue;
      }

      if (currentChar === '"' || currentChar === "'") {
        inString = true;
        stringDelimiter = currentChar;
        value += currentChar;
        this.step();
        continue;
      }

      if (/[\s=.,\[\]{}#\n\r]/.test(currentChar)) break;

      value += currentChar;
      this.step();
    }

    if (value === "") {
      this.step();
      return this.parseKeyValue();
    }

    if (this.previousWasAKey) {
      this.previousWasAKey = false;

      // check for boolean
      if (value === 'true' || value === 'false') {
        this.previousWasAKey = false;
        return this.createToken(TokenType.BOOLEAN, value, startPos, startLine, startCol);
      }

      // Check for special float values: inf, +inf, -inf, nan, +nan, -nan
      if (/^[+-]?(inf|nan)$/.test(value)) {
        this.previousWasAKey = false;
        return this.createToken(TokenType.FLOAT, value, startPos, startLine, startCol);
      }

      // Check for numbers
      if (/^[+-]?(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[0-9_]*(?:\.[0-9_]+)?(?:[eE][+-]?[0-9_]+)?)$/.test(value)) {
        this.previousWasAKey = false;
        if (value.includes('.') || value.includes('e') || value.includes('E')) return this.createToken(TokenType.FLOAT, value, startPos, startLine, startCol);
        else return this.createToken(TokenType.INTEGER, value, startPos, startLine, startCol);
      }
      return this.createToken(TokenType.STRING, value, startPos, startLine, startCol);

    }
    else {
      this.previousWasAKey = true;
      return this.createToken(TokenType.IDENTIFIER, value, startPos, startLine, startCol);
    }
  }

  private createToken = (type: TokenType, value: string, position: number = this.position, line: number = this.line, column: number = this.column): Token => {
    return {
      type,
      value,
      position,
      line,
      column
    };
  }
}

// Parser Class
class TomlParser {
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
}

interface Token {
  type: TokenType;
  value: string | number | boolean;
  position: number;
  line: number;
  column: number;
}

enum TokenType {
  // Literals
  STRING,
  BOOLEAN,
  INTEGER,
  FLOAT,

  // Identifiers
  IDENTIFIER,

  // Delimiters
  EQUALS
}

class TomlError extends Error {
  constructor(message: string, line: number, column: number) {
    super(`${message} at line ${line}, column ${column}`);
    this.name = 'TomlError';
  }
}

export default toml