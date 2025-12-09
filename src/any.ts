import StructuredData from "./StructuredData.js"
import { PathLike } from "fs"
import { FileHandle } from "fs/promises"
import { detectFormat } from "./utils/detectFormat.js"
import { csv, json, xml, yaml } from "./index.js"
import fs from "fs"

// Facade that automatically tests every supported parser until one succeeds.
// Consumers can hand it arbitrary text or a file path and receive StructuredData.
// Think of it as a "best effort" entrypoint when you do not know the format.
const any = {
  /**
   * Attempts to parse an arbitrary text payload by predicting the format and
   * dispatching to the matching adapter. Falls back to brute-force parsing with
   * every known adapter while capturing per-format errors for observability.
   * Returns `null` only when `suppressErrors` is true and all parsers fail.
   */
  // Parse data from a string (automatically detecting its format)
  from(text: string, suppressErrors: boolean = false): StructuredData | null {
    // Predict once to prioritize the likely parser and avoid unnecessary work.
    // First predict the format
    const predictedFormat = detectFormat(text)

    // Try the predicted format first if available
    if (predictedFormat) {
      try {
        switch (predictedFormat) {
          case "json":
            return json.from(text)
          case "xml":
            return xml.from(text)
          case "csv":
            return csv.from(text)
          case "yaml":
            return yaml.from(text)
        }
      } catch {
        // Prediction can be wrong or payload might be malformed—failure just
        // means we will fall through to the exhaustive parsing phase below.
      }
    }
    // Try all formats if prediction failed or predicted format parser failed
    // Capture each error message to build a helpful aggregate exception later.
    // This makes troubleshooting easier because you get every parser's response.
    const errors: Record<string, string> = {}

    if (predictedFormat != "json") {
      try {
        return json.from(text)
      } catch (e) {
        errors.json = (e as Error).message
      }
    }

    if (predictedFormat != "xml") {
      try {
        return xml.from(text)
      } catch (e) {
        errors.xml = (e as Error).message
      }
    }

    if (predictedFormat != "csv") {
      try {
        return csv.from(text)
      } catch (e) {
        errors.csv = (e as Error).message
      }
    }

    if (predictedFormat != "yaml") {
      try {
        return yaml.from(text)
      } catch (e) {
        errors.yaml = (e as Error).message
      }
    }

    if (suppressErrors) return null
    else throw new Error(`Failed to parse data in any supported format: ${JSON.stringify(errors)}`)
  },

  // Load a file and parse its content, automatically (detecting its format)
  /**
   * Reads the provided path/FileHandle as UTF-8 text and delegates to `from`.
   * Mirrors `suppressErrors` semantics so callers can opt into soft failures
   * when dealing with user-supplied or optional files.
   */
  async loadFile(
    path: PathLike | FileHandle,
    suppressErrors: boolean = false,
  ): Promise<StructuredData | null> {
    try {
      const content = await fs.promises.readFile(path, "utf8")
      return this.from(content, suppressErrors)
    } catch (e) {
      // I/O errors (missing files, permission issues) surface here; optionally
      // swallow them to align with the caller's desired error-handling model.
      // Returning null when suppressed lets callers decide whether to retry.
      if (suppressErrors) return null
      throw e
    }
  },
}

export default any
