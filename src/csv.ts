import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"

const csv: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
  const text = (await fs.readFile(path)).toString()
  return csv.from(text)
  },

  from: function (text: string): StructuredData {
    throw new Error("Function not implemented.")
  },
}

export default csv
