

import { YAML_CONSTANTS, YAMLValue } from "../types/yaml.js"

/**
 * Checks if a string is a quoted string (single or double quotes)
 * 
 * @param value - The string to check
 * @returns True if the string is quoted
 */
export function isQuotedString(value: string): boolean {
    const { DOUBLE, SINGLE } = YAML_CONSTANTS.QUOTES
    return (value.startsWith(DOUBLE) && value.endsWith(DOUBLE)) ||
        (value.startsWith(SINGLE) && value.endsWith(SINGLE))
}

/**
 * Removes quotes from a quoted string
 * 
 * @param value - The quoted string
 * @returns The unquoted string
 */
export function unquoteString(value: string): string {
    return value.slice(1, -1)
}

/**
 * Checks if a string represents a null value in YAML
 * 
 * @param value - The string to check
 * @returns True if the string represents null
 */
export function isNullValue(value: string): boolean {
    return (YAML_CONSTANTS.NULL_VALUES as readonly string[]).includes(value)
}

/**
 * Checks if a string represents a boolean true value in YAML
 * 
 * @param value - The string to check
 * @returns True if the string represents boolean true
 */
export function isTrueValue(value: string): boolean {
    return (YAML_CONSTANTS.TRUE_VALUES as readonly string[]).includes(value)
}

/**
 * Checks if a string represents a boolean false value in YAML
 * 
 * @param value - The string to check
 * @returns True if the string represents boolean false
 */
export function isFalseValue(value: string): boolean {
    return (YAML_CONSTANTS.FALSE_VALUES as readonly string[]).includes(value)
}

/**
 * Checks if a string represents an integer
 * 
 * @param value - The string to check
 * @returns True if the string is an integer
 */
export function isInteger(value: string): boolean {
    return YAML_CONSTANTS.PATTERNS.INTEGER.test(value)
}

/**
 * Checks if a string represents a float
 * 
 * @param value - The string to check
 * @returns True if the string is a float
 */
export function isFloat(value: string): boolean {
    return YAML_CONSTANTS.PATTERNS.FLOAT.test(value)
}

/**
 * Removes inline comments from a line
 * 
 * @param line - The line to process
 * @returns The line with inline comments removed
 */
export function removeInlineComments(line: string): string {
    const commentIndex = line.indexOf(YAML_CONSTANTS.INLINE_COMMENT_PREFIX)
    return commentIndex !== -1
        ? line.substring(0, commentIndex).trim()
        : line
}

/**
 * Checks if a line should be skipped during parsing
 * 
 * @param line - The trimmed line to check
 * @returns True if the line should be skipped
 */
export function shouldSkipLine(line: string): boolean {
    return !line ||
        line.startsWith(YAML_CONSTANTS.COMMENT_PREFIX) ||
        line === YAML_CONSTANTS.DOCUMENT_START ||
        line === YAML_CONSTANTS.DOCUMENT_END
}

/**
 * Calculates the indentation level of a line
 * 
 * @param line - The line to measure
 * @returns The number of leading spaces
 */
export function getIndentLevel(line: string): number {
    return line.length - line.trimStart().length
}

/**
 * Checks if a string needs to be quoted when serializing to YAML
 * A string needs quoting if it contains special characters or looks like another type
 * 
 * @param value - The string value to check
 * @returns True if the string should be quoted
 */
export function needsQuoting(value: string): boolean {
    return YAML_CONSTANTS.PATTERNS.SPECIAL_CHARS.test(value) ||
        YAML_CONSTANTS.PATTERNS.AMBIGUOUS_VALUES.test(value) ||
        value.trim() !== value
}

/**
 * Quotes a string value for YAML serialization
 * 
 * @param value - The string to quote
 * @returns The quoted string
 */
export function quoteString(value: string): string {
    return `${YAML_CONSTANTS.QUOTES.DOUBLE}${value}${YAML_CONSTANTS.QUOTES.DOUBLE}`
}

/**
 * Creates the appropriate indentation string for a given level
 * 
 * @param level - The indentation level
 * @returns The indentation string (2 spaces per level)
 */
export function createIndent(level: number): string {
    return " ".repeat(level * YAML_CONSTANTS.INDENT_SIZE)
}

/**
 * Parses a trimmed string value into the appropriate JavaScript type
 * 
 * @param value - The trimmed string value to parse
 * @returns The parsed value as the appropriate type
 */
export function parseScalarValue(value: string): YAMLValue {
    // Handle quoted strings
    if (isQuotedString(value)) {
        return unquoteString(value)
    }

    // Handle null values
    if (isNullValue(value)) {
        return null
    }

    // Handle boolean values
    if (isTrueValue(value)) {
        return true
    }
    if (isFalseValue(value)) {
        return false
    }

    // Handle numbers
    if (isInteger(value)) {
        return parseInt(value, 10)
    }
    if (isFloat(value)) {
        return parseFloat(value)
    }

    // Return as string
    return value
}
