import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat.js"
import StructuredData from "./StructuredData.js"

// YAML value types
type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]

interface YAMLObject {
  [key: string]: YAMLValue
}

// Simple YAML parser
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

const parseYAML = (text: string): YAMLObject => {
  const lines = text.split("\n")
  const result: YAMLObject = {}
  const stack: Array<{ obj: YAMLObject | YAMLValue[], indent: number, key?: string, expectsNested?: boolean }> = [{ obj: result, indent: -1, expectsNested: true }]
  let lastCompletedKeyIndent = -1 // Track the indent level of the last completed key-value pair

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const indent = line.length - line.trimStart().length
    let trimmed = line.trim()

    // Skip empty lines, comments, and document separators
    if (!trimmed || trimmed.startsWith("#") || trimmed === "---" || trimmed === "...") {
      continue
    }

    // Remove inline comments
    const commentIndex = trimmed.indexOf(" #")
    if (commentIndex !== -1) {
      trimmed = trimmed.substring(0, commentIndex).trim()
    }

    // Check for invalid indentation patterns
    if (indent > 0) {
      // If this line is indented but the last completed key-value pair was at the same or higher indent,
      // and no parent expects nested content at this level, it's invalid
      if (lastCompletedKeyIndent >= 0 && indent > lastCompletedKeyIndent) {
        // Look for a valid parent that expects nested content
        // The parent must have an indent level that is actually less than the current indent
        // AND must expect nested content
        // AND must not be the root if we have a completed key at the same or lower level
        let foundValidParent = false
        for (let j = stack.length - 1; j >= 0; j--) {
          // Special case: if this is the root entry (-1) and we have a completed key-value pair
          // at indent 0 or higher, the root should not accept nested content
          if (stack[j].indent === -1 && lastCompletedKeyIndent >= 0) {
            continue
          }

          if (stack[j].indent < indent && stack[j].expectsNested === true) {
            foundValidParent = true
            break
          }
        }

        if (!foundValidParent) {
          throw new SyntaxError(`Invalid indentation at line ${i + 1}`)
        }
      }
    }

    // Handle indentation changes - pop stack if we're at a lower or equal indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    const current = stack[stack.length - 1]

    // Handle list items
    if (trimmed.startsWith("- ")) {
      const itemContent = trimmed.substring(2).trim()

      // Ensure we're in an array context
      if (!Array.isArray(current.obj)) {
        throw new SyntaxError(`Unexpected list item at line ${i + 1}`)
      }

      // Check if the item contains a key-value pair
      if (itemContent.includes(":")) {
        const colonIndex = itemContent.indexOf(":")
        const key = itemContent.substring(0, colonIndex).trim()
        const value = itemContent.substring(colonIndex + 1).trim()

        // Create a new object for this list item
        const obj: YAMLObject = {}
        current.obj.push(obj)

        if (value) {
          // Simple key-value in list item
          obj[key] = parseYAMLValue(value)
        } else {
          // Key with potential nested content in list item
          obj[key] = null // Default to null, will be overwritten if nested content found
        }

        // Push this object to the stack for potential nested content
        stack.push({ obj, indent, key, expectsNested: !value })
      } else {
        // Simple list item
        current.obj.push(parseYAMLValue(itemContent))
      }
      continue
    }

    // Handle key-value pairs
    if (trimmed.includes(":")) {
      const colonIndex = trimmed.indexOf(":")
      const key = trimmed.substring(0, colonIndex).trim()
      const value = trimmed.substring(colonIndex + 1).trim()

      if (Array.isArray(current.obj)) {
        throw new SyntaxError(`Unexpected key-value pair in array context at line ${i + 1}`)
      }

      if (value) {
        // Simple key-value pair - this completes immediately and doesn't expect nested content
        current.obj[key] = parseYAMLValue(value)
        lastCompletedKeyIndent = indent
      } else {
        // Key with nested content - look ahead to determine if it's an array or object
        let nextLineIndex = i + 1
        let foundNextContent = false
        let isArray = false

        // Look for the next non-empty, non-comment line
        while (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim()
          if (nextLine && !nextLine.startsWith("#")) {
            const nextIndent = lines[nextLineIndex].length - lines[nextLineIndex].trimStart().length
            if (nextIndent > indent) {
              foundNextContent = true
              isArray = nextLine.startsWith("- ")
              break
            } else {
              // Same or lower indent, no nested content
              break
            }
          }
          nextLineIndex++
        }

        if (foundNextContent) {
          if (isArray) {
            // Next content is a list
            const array: YAMLValue[] = []
            current.obj[key] = array
            stack.push({ obj: array, indent, key, expectsNested: true })
          } else {
            // Next content is an object
            const obj: YAMLObject = {}
            current.obj[key] = obj
            stack.push({ obj, indent, key, expectsNested: true })
          }
          lastCompletedKeyIndent = -1 // Reset since this key expects nested content
        } else {
          // No nested content, set as null
          current.obj[key] = null
          lastCompletedKeyIndent = indent
        }
      }
    }
  }

  return result
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
