import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat.js"
import StructuredData from "./StructuredData.js"

// YAML value types
type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]

interface YAMLObject {
  [key: string]: YAMLValue
}

interface YAMLMetadata {
  originalIndentation?: string
  originalQuoting?: "single" | "double" | "none"
  originalMultiline?: "literal" | "folded" | "none"
  comments?: string[]
}

interface YAMLNode {
  value: YAMLValue
  metadata?: YAMLMetadata
}

interface YAMLDocument {
  content: YAMLObject
  metadata: {
    documentSeparators?: boolean
    version?: string
    tags?: Record<string, string>
  }
}

// Tokenizer for YAML
interface YAMLToken {
  type: "KEY" | "VALUE" | "LIST_ITEM" | "COMMENT" | "DOCUMENT_START" | "DOCUMENT_END" | "INDENT" | "NEWLINE"
  value: string
  line: number
  column: number
  indent: number
}

const tokenizeYAML = (text: string): YAMLToken[] => {
  const lines = text.split("\n")
  const tokens: YAMLToken[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    const indent = line.length - line.trimStart().length
    const trimmed = line.trim()

    if (trimmed === "") {
      tokens.push({
        type: "NEWLINE",
        value: "",
        line: lineIndex + 1,
        column: 0,
        indent: 0
      })
      continue
    }

    if (trimmed === "---") {
      tokens.push({
        type: "DOCUMENT_START",
        value: "---",
        line: lineIndex + 1,
        column: indent,
        indent
      })
      continue
    }

    if (trimmed === "...") {
      tokens.push({
        type: "DOCUMENT_END",
        value: "...",
        line: lineIndex + 1,
        column: indent,
        indent
      })
      continue
    }

    if (trimmed.startsWith("#")) {
      tokens.push({
        type: "COMMENT",
        value: trimmed.substring(1).trim(),
        line: lineIndex + 1,
        column: indent,
        indent
      })
      continue
    }

    if (trimmed.startsWith("- ")) {
      tokens.push({
        type: "LIST_ITEM",
        value: trimmed.substring(2),
        line: lineIndex + 1,
        column: indent,
        indent
      })
      continue
    }

    if (trimmed.includes(":")) {
      const colonIndex = trimmed.indexOf(":")
      const key = trimmed.substring(0, colonIndex).trim()
      const value = trimmed.substring(colonIndex + 1).trim()

      tokens.push({
        type: "KEY",
        value: key,
        line: lineIndex + 1,
        column: indent,
        indent
      })

      if (value) {
        tokens.push({
          type: "VALUE",
          value: value,
          line: lineIndex + 1,
          column: indent + colonIndex + 1,
          indent: 0
        })
      }
    } else {
      tokens.push({
        type: "VALUE",
        value: trimmed,
        line: lineIndex + 1,
        column: indent,
        indent
      })
    }
  }

  return tokens
}

const parseYAMLValue = (value: string): YAMLValue => {
  const trimmed = value.trim()

  // Handle quoted strings
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }

  // Handle null values
  if (trimmed === "null" || trimmed === "~" || trimmed === "") {
    return null
  }

  // Handle boolean values
  if (trimmed === "true" || trimmed === "yes" || trimmed === "on") {
    return true
  }
  if (trimmed === "false" || trimmed === "no" || trimmed === "off") {
    return false
  }

  // Handle numbers
  if (/^-?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10)
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed)
  }

  // Return as string
  return trimmed
}

const parseYAML = (text: string): YAMLDocument => {
  const tokens = tokenizeYAML(text)
  const result: YAMLObject = {}
  const stack: Array<{ obj: YAMLObject | YAMLValue[], key?: string, indent: number }> = [{ obj: result, indent: -1 }]

  let i = 0
  while (i < tokens.length) {
    const token = tokens[i]

    if (token.type === "COMMENT" || token.type === "NEWLINE" ||
      token.type === "DOCUMENT_START" || token.type === "DOCUMENT_END") {
      i++
      continue
    }

    // Handle indentation changes
    while (stack.length > 1 && stack[stack.length - 1].indent >= token.indent) {
      stack.pop()
    }

    const current = stack[stack.length - 1]

    if (token.type === "KEY") {
      const key = token.value
      const nextToken = tokens[i + 1]

      if (nextToken && nextToken.type === "VALUE") {
        // Simple key-value pair
        const value = parseYAMLValue(nextToken.value)
        if (Array.isArray(current.obj)) {
          current.obj.push({ [key]: value })
        } else {
          current.obj[key] = value
        }
        i += 2
      } else {
        // Key with nested content
        const nestedObj: YAMLObject = {}
        if (Array.isArray(current.obj)) {
          current.obj.push({ [key]: nestedObj })
        } else {
          current.obj[key] = nestedObj
        }
        stack.push({ obj: nestedObj, key, indent: token.indent })
        i++
      }
    } else if (token.type === "LIST_ITEM") {
      let arrayKey = current.key
      if (!arrayKey) {
        // Create array at root level
        arrayKey = "_items"
      }

      if (typeof current.obj === "object" && !Array.isArray(current.obj)) {
        if (!current.obj[arrayKey] || !Array.isArray(current.obj[arrayKey])) {
          current.obj[arrayKey] = []
        }

        const array = current.obj[arrayKey] as YAMLValue[]
        const value = parseYAMLValue(token.value)
        array.push(value)
      }
      i++
    } else {
      i++
    }
  }

  return {
    content: result,
    metadata: {}
  }
}

const yaml: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return yaml.from(text)
  },

  from: function (text: string): StructuredData {
    if (!text.trim()) {
      throw new SyntaxError("Empty YAML document")
    }

    try {
      const parsed = parseYAML(text)
      return new StructuredData(parsed, "yaml")
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw error
      }
      const message = typeof error === "object" && error !== null && "message" in error
        ? (error as { message: string }).message
        : String(error)
      throw new SyntaxError(`Invalid YAML: ${message}`)
    }
  },
}

export default yaml
