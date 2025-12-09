import { compareArrays } from "./utils/common.js"

/**
 * Shape used while working with XML. Each value can be plain text, another
 * object, or an array of more XML values. Object keys match the tag names found
 * in the original document.
 */
type XMLValue = string | XMLObject | XMLValue[]
interface XMLObject {
  [key: string]: string | XMLValue
}

/**
 * Common wrapper returned by every parser. Remembers which format produced the
 * data and offers helpers to view it in a friendly JavaScript shape.
 */
export default class StructuredData {
  private _data: object
  originFormat: "csv" | "json" | "xml" | "yaml"

  /**
   * @param data Raw payload from the parser (JSON object, CSV rows, XML tree,
   * etc.). Stored as-is so we do not lose information.
   * @param originFormat Remember which parser created the payload so we know how
   * to convert it later.
   */
  constructor(data: object, originFormat: "csv" | "json" | "xml" | "yaml") {
    this._data = data
    this.originFormat = originFormat
  }

  /**
   * Converts the internal XML tree into easier-to-use objects and arrays. It
   * groups repeating child items, keeps single items simple, and gives up only
   * when the structure is too mixed to guess safely.
   */
  private static _getXmlData = (
    element: XMLValue,
    isCollection: boolean = false,
    collectionName: string | null = null,
    parentKey: string | null = null,
  ): XMLValue => {
    // recursively go through each element

    if (typeof element === "string") return element
    else if (typeof element === "object") {
      if (Array.isArray(element)) {
        if (element.length === 0) return this._getXmlData(element)
        if (element.length === 1) return this._getXmlData(element[0])
        // check if all element have a common shape, so that we can group them together
        let shapes = element.map((sub) => Object.keys(sub))
        let sampleShape = shapes[0]
        let hasCommonShape = shapes.every((shape) => compareArrays(shape, sampleShape))
        if (hasCommonShape) {
          // if the shape has only one key, we can name the collection with that key instead
          if (sampleShape.length === 1) {
            let name = sampleShape[0]
            let data = element.map((sub) => StructuredData._getXmlData(sub, true, name))
            return parentKey === name + "s" ? data : { [name + "s"]: data }
          }
        } else {
          let obj = {} as XMLObject
          for (let sub of element) {
            const [k, v] = Object.entries(sub as XMLValue)[0] || []
            obj[k] = this._getXmlData(v, false, null, k)
          }
          return obj
        }
      } else {
        if (isCollection && collectionName) {
          return StructuredData._getXmlData(element[collectionName])
        } else {
          let obj = {} as XMLObject
          for (let [k, v] of Object.entries(element)) {
            obj[k] = this._getXmlData(v, false, null, k)
          }
          return obj
        }
      }
    }
    // fallback, the code shouldn't reach here.
    return element
  }

  /**
   * Returns the data in a convenient shape. XML gets extra processing to look
   * like regular nested objects, while other formats are returned as stored.
   */
  get data(): object {
    // data getter attempts to return data in a more javascript friendly way
    // the returned data will be suitable to be converted in json if required
    // however, if we wanted to convert the data into its native format
    // for example, converting back to xml - we need to know its original shape
    // that's the reason to maintain a separate _data field and a data getter
    switch (this.originFormat) {
      case "csv":
        return this._data
      case "xml":
        const rootKey = Object.keys(this._data)[0]
        const root = (this._data as XMLObject)[rootKey]
        return { [rootKey]: StructuredData._getXmlData(root) }
      case "yaml":
        throw new TypeError("Format not supported")
      case "json":
        return this._data
      default:
        throw new TypeError("Unknown format")
    }
  }

  /** Plans to convert the stored data back into CSV text. */
  toCsv(): string {
    throw new Error("Function not implemented.")
  }

  /** Plans to convert the stored data back into JSON text. */
  toJson(): string {
    throw new Error("Function not implemented.")
  }

  /** Plans to convert the stored data back into XML text. */
  toXml(): string {
    throw new Error("Function not implemented.")
  }

  /** Plans to convert the stored data back into YAML text. */
  toYaml(): string {
    throw new Error("Function not implemented.")
  }

  /** Plans to write the data to disk as CSV. */
  async exportCsv(): Promise<void> {
    throw new Error("Function not implemented")
  }

  /** Plans to write the data to disk as JSON. */
  async exportJson(): Promise<void> {
    throw new Error("Function not implemented")
  }

  /** Plans to write the data to disk as XML. */
  async exportXml(): Promise<void> {
    throw new Error("Function not implemented")
  }

  /** Plans to write the data to disk as YAML. */
  async exportYaml(): Promise<void> {
    throw new Error("Function not implemented")
  }
}
