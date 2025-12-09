import { promises as fs, PathLike } from "fs"
import StructuredData from "../StructuredData.js"

/**
 * Options that every parser in this project understands.
 * - `header`: set to true when the first row contains column names (mainly for CSV).
 */
export interface Options {
  header?: boolean
}

/**
 * Simple contract every data-format adapter must follow. Implementations should
 * know how to read from disk and how to parse plain text strings, always
 * returning a StructuredData object on success.
 */
export default interface DataFormat {
  /**
   * Opens the given file (or handle), parses it, and returns StructuredData.
   * Implementations can look at `opts` to tweak behavior, such as CSV headers.
   */
  loadFile(path: PathLike | fs.FileHandle, opts?: Options): Promise<StructuredData>
  /**
   * Parses already-loaded text, skipping any file I/O. Useful when the caller
   * already has the content in memory or fetched it from a network call.
   */
  from(text: string, opts?: Options): StructuredData
}
