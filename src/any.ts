import StructuredData from "./StructuredData.js"
import { PathLike } from "fs"
import { FileHandle } from "fs/promises"
import { detectFormat } from "./utils/detectFormat.js"
import { csv, json, xml, yaml } from "./index.js"
import fs from "fs"

const any = {
  // Parse data from a string (automatically detecting its format)
  from(text: string, suppressErrors: boolean = false): StructuredData | null {
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
      } catch {}
    }
    // Try all formats if prediction failed or predicted format parser failed
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
  async loadFile(
    path: PathLike | FileHandle,
    suppressErrors: boolean = false,
  ): Promise<StructuredData | null> {
    try {
      const content = await fs.promises.readFile(path, "utf8")
      return this.from(content, suppressErrors)
    } catch (e) {
      if (suppressErrors) return null
      throw e
    }
  },
}

export default any
