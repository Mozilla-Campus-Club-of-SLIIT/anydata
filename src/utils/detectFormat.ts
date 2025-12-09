// Analyzes text content using regex patterns to quickly determine its data format (JSON, XML, CSV, or YAML)
/**
 * Quick helper that guesses the most likely format before we try any parser.
 * The rules focus on obvious signs only, so we do not mislabel data:
 * - Trim surrounding spaces first.
 * - JSON: looks for braces/brackets at both ends.
 * - XML: looks for angle brackets and tag names.
 * - CSV: looks for line breaks plus commas/semicolons without JSON braces.
 * - YAML: looks for `key: value` lines or `- item` style lists.
 * Returns `null` when it cannot confidently pick a format.
 */
export const detectFormat = (text: string): "json" | "xml" | "csv" | "yaml" | null => {
  text = text.trim()

  // Check for JSON - starts with { or [ and ends with } or ]
  if (
    (text.startsWith("{") && text.endsWith("}")) ||
    (text.startsWith("[") && text.endsWith("]"))
  ) {
    return "json"
  }
  // Check for XML - starts with < and contains closing tags
  else if (text.startsWith("<") && /<\/?[a-zA-Z][\w\-\.]*[^<>]*>/i.test(text)) {
    return "xml"
  }
  // Check for CSV - contains commas or semicolons and multiple lines
  else if (/\n/g.test(text) && /([,;])/g.test(text) && !/[{}[\]<>]/.test(text)) {
    return "csv"
  }
  // Check for YAML - typical YAML patterns
  else if (/^[a-zA-Z0-9_-]+:\s/m.test(text) || /^\s*-\s+[a-zA-Z0-9_-]+/m.test(text)) {
    return "yaml"
  }
  return null
}
