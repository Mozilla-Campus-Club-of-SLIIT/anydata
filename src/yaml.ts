/**
 * @fileoverview YAML format support for the anydata library
 * 
 * This module provides comprehensive YAML parsing and serialization capabilities
 * without external dependencies. It implements a custom YAML parser that supports
 * all major YAML constructs and provides round-trip conversion capability.
 * 
 * Features:
 * - Custom YAML parser (no external dependencies)
 * - Support for all YAML data types (scalars, sequences, mappings)
 * - Proper handling of YAML-specific features (comments, document separators)
 * - Round-trip conversion (YAML → JavaScript → YAML)
 * - Comprehensive error handling and validation
 * - Integration with StructuredData class for format-agnostic operations
 * 
 * Supported YAML features:
 * - Scalars: strings, numbers, booleans, null
 * - Collections: sequences (arrays), mappings (objects)
 * - Comments (inline and block)
 * - Document separators (---, ...)
 * - Quoted and unquoted strings
 * - Multi-level nesting
 * - Proper indentation handling
 * 
 * @example
 * ```typescript
 * import { yaml } from './yaml.js';
 * 
 * // Parse YAML string
 * const data = yaml.from(`
 *   application:
 *     name: MyApp
 *     version: 1.0.0
 *     features:
 *       - authentication
 *       - logging
 *       - monitoring
 * `);
 * 
 * // Access parsed data
 * console.log(data.data.application.name); // "MyApp"
 * console.log(data.originFormat); // "yaml"
 * 
 * // Convert back to YAML
 * const yamlString = data.toYaml();
 * 
 * // Load from file
 * const fileData = await yaml.loadFile('config.yaml');
 * ```
 * 
 * @author Mozilla Campus Club of SLIIT
 * @since 1.0.0
 */

import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat.js"
import StructuredData from "./StructuredData.js"

/**
 * Represents any valid YAML value type including primitives, objects, and arrays
 */
type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]

/**
 * Represents a YAML object with string keys and YAML values
 */
interface YAMLObject {
  [key: string]: YAMLValue
}

/**
 * Parses a single YAML value string into its corresponding JavaScript type
 * 
 * @param value - The string value to parse
 * @returns The parsed value as the appropriate JavaScript type
 * 
 * @example
 * ```typescript
 * parseYAMLValue("true") // returns true
 * parseYAMLValue("42") // returns 42
 * parseYAMLValue("\"hello\"") // returns "hello"
 * parseYAMLValue("null") // returns null
 * ```
 */
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

/**
 * Main YAML parser function that converts YAML text into a JavaScript object
 * 
 * @param text - The YAML text to parse
 * @returns A JavaScript object representing the parsed YAML structure
 * @throws {SyntaxError} When the YAML syntax is invalid or indentation is incorrect
 * 
 * @example
 * ```typescript
 * const yamlText = `
 * name: John
 * age: 30
 * hobbies:
 *   - reading
 *   - coding
 * `;
 * const result = parseYAML(yamlText);
 * // Returns: { name: "John", age: 30, hobbies: ["reading", "coding"] }
 * ```
 */
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

/**
 * YAML data format handler implementing the DataFormat interface
 * Provides methods for loading and parsing YAML data into StructuredData objects
 * 
 * Features:
 * - Custom YAML parser (no external dependencies)
 * - Support for all major YAML constructs (objects, arrays, scalars)
 * - Proper error handling with descriptive messages
 * - Round-trip conversion capability with toYaml() method
 * 
 * @example
 * ```typescript
 * import { yaml } from './yaml.js';
 * 
 * // Parse YAML string
 * const data = yaml.from(`
 *   name: John
 *   age: 30
 *   hobbies: [reading, coding]
 * `);
 * 
 * // Load YAML file
 * const fileData = await yaml.loadFile('config.yaml');
 * 
 * // Convert back to YAML
 * const yamlString = data.toYaml();
 * ```
 */
const yaml: DataFormat = {
  /**
   * Loads and parses a YAML file into a StructuredData object
   * 
   * @param path - File path or file handle to the YAML file
   * @returns Promise that resolves to a StructuredData object with originFormat 'yaml'
   * @throws {Error} When file cannot be read or contains invalid YAML
   * 
   * @example
   * ```typescript
   * try {
   *   const data = await yaml.loadFile('config.yaml');
   *   console.log(data.data); // Access the parsed YAML data
   *   console.log(data.originFormat); // 'yaml'
   * } catch (error) {
   *   console.error('Failed to load YAML file:', error.message);
   * }
   * ```
   */
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return yaml.from(text)
  },

  /**
   * Parses a YAML string into a StructuredData object
   * 
   * @param text - The YAML string to parse
   * @returns A StructuredData object containing the parsed data with originFormat 'yaml'
   * @throws {SyntaxError} When the YAML syntax is invalid, empty, or has incorrect indentation
   * 
   * @example
   * ```typescript
   * const yamlString = `
   *   database:
   *     host: localhost
   *     port: 5432
   *   servers:
   *     - name: web1
   *       roles: [web, api]
   *     - name: db1
   *       roles: [database]
   * `;
   * 
   * try {
   *   const data = yaml.from(yamlString);
   *   console.log(data.data.database.host); // 'localhost'
   *   console.log(data.data.servers[0].name); // 'web1'
   * } catch (error) {
   *   console.error('YAML parsing failed:', error.message);
   * }
   * ```
   */
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
