import { promises as fs, PathLike } from "fs"
import StructuredData from "../StructuredData.js"

export interface Options {
  header?: boolean
}

export default interface DataFormat {
  loadFile(path: PathLike | fs.FileHandle, opts?: Options): Promise<StructuredData>
  from(text: string, opts?: Options): StructuredData
}
