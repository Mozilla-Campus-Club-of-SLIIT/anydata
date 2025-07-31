/**
 * Represents any valid YAML value type including primitives, objects, and arrays
 * Supports all YAML scalar types: strings, numbers, booleans, null
 */
export type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]

/**
 * Represents a YAML object with string keys and YAML values
 * Used for mapping YAML key-value pairs in parsed data structures
 */
export interface YAMLObject {
  [key: string]: YAMLValue
}

/**
 * Represents a stack item used during YAML parsing for tracking nested structures
 */
export interface YAMLParserStackItem {
  obj: YAMLObject | YAMLValue[]
  indent: number
  key?: string
  expectsNested?: boolean
}

/**
 * YAML parsing constants for consistent behavior
 */
export const YAML_CONSTANTS = {
  /** Standard YAML indentation (2 spaces) */
  INDENT_SIZE: 2,

  /** Root level indent marker */
  ROOT_INDENT: -1,

  /** Document separators */
  DOCUMENT_START: "---",
  DOCUMENT_END: "...",

  /** List item prefix */
  LIST_PREFIX: "- ",

  /** Comment markers */
  COMMENT_PREFIX: "#",
  INLINE_COMMENT_PREFIX: " #",

  /** Null value representations */
  NULL_VALUES: ["null", "~", ""] as const,

  /** Boolean true representations */
  TRUE_VALUES: ["true", "yes", "on"] as const,

  /** Boolean false representations */
  FALSE_VALUES: ["false", "no", "off"] as const,

  /** Quote characters */
  QUOTES: {
    DOUBLE: "\"",
    SINGLE: "'",
  } as const,

  /** Regular expressions for value parsing */
  PATTERNS: {
    /** Integer pattern: optional minus sign followed by digits */
    INTEGER: /^-?\d+$/,

    /** Float pattern: optional minus sign, digits, decimal point, digits */
    FLOAT: /^-?\d+\.\d+$/,

    /** Characters that require string quoting */
    SPECIAL_CHARS: /[:#{-]/,

    /** Values that look like other types and need quoting */
    AMBIGUOUS_VALUES: /^(true|false|null|yes|no|on|off|~|-?\d+(\.\d+)?)$/i,
  } as const,
} as const

/**
 * Type guard to check if a value is a YAML object
 */
export function isYAMLObject(value: YAMLValue): value is YAMLObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Type guard to check if a value is a YAML array
 */
export function isYAMLArray(value: YAMLValue): value is YAMLValue[] {
  return Array.isArray(value)
}

/**
 * Type guard to check if a value is a YAML scalar (primitive)
 */
export function isYAMLScalar(value: YAMLValue): value is string | number | boolean | null {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  )
}
