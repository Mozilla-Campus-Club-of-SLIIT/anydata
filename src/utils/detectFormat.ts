// Analyzes text content using regex patterns to quickly determine its data format (JSON, XML, CSV, or YAML)
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
