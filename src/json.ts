import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

/**
 * Minimal JSON adapter. Delegates parsing to `JSON.parse` while wrapping the
 * result inside StructuredData so callers get a consistent API across formats.
 */
const json: DataFormat = {
  /** Reads file contents as UTF-8 text and forwards to `from`. */
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return json.from(text)
  },

  /** Parses in-memory JSON text into StructuredData backed by native objects. */
  from: function (text: string): StructuredData {
    const object = JSON.parse(text)
    return new StructuredData(object, "json")
  },
}

export default json
