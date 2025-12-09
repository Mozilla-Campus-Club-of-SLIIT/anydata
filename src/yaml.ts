import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

/**
 * Placeholder adapter for YAML support. We keep the DataFormat shape so the
 * rest of the library can already reference `yaml`, even though it throws.
 */
const yaml: DataFormat = {
  /**
   * Will eventually read YAML files and return StructuredData. For now it lets
   * callers know the feature is missing by throwing an explicit error.
   */
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    throw new Error("Function not implemented.")
  },

  /**
   * Will eventually parse YAML strings in memory. Currently unimplemented.
   */
  from: function (text: string): StructuredData {
    throw new Error("Function not implemented.")
  },
}

export default yaml
