type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]

interface YAMLObject {
  [key: string]: YAMLValue
}

interface YAMLMetadata {
  originalIndentation?: string
  originalQuoting?: "single" | "double" | "none"
  originalMultilines?: "literal" | "folded" | "none"
  comments?: string[]
}

interface YAMLNode {
  value: YAMLValue
  metadata?: YAMLMetadata
}

interface YAMLDocument {
  content: YAMLDocument
  metadata: {
    documentSeparators?: boolean
    version?: string
    tags?: Record<string, string>
  }
}

interface YAMLToken {
  type:
  "KEY"
  | "VALUE"
  | "LIST_ITEM"
  | "COMMENT"
  | "DOCUMENT_START"
  | "DOCUMENT_END"
  | "INDENT"
  | "NEW_LINE"
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
        type: "NEW_LINE",
        value: "",
        line: lineIndex + 1,
        column: 0,
        indent: 0
      })
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


    if (trimmed.startsWith("#")) {
      tokens.push({
        type: "COMMENT",
        value: trimmed.substring(1).trim(),
        line: lineIndex + 1,
        column: indent,
        indent
      })
    }

    if (trimmed === "...") {
      tokens.push({
        type: "DOCUMENT_END",
        value: "...",
        line: lineIndex + 1,
        column: indent,
        indent
      })
    }

    if (trimmed.startsWith("-")) {
      tokens.push({
        type: "LIST_ITEM",
        value: trimmed.substring(2),
        line: lineIndex + 1,
        column: indent,
        indent
      })
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

  return trimmed

}

