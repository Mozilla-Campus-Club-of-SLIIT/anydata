import { compareArrays } from "./utils/common.js"

type XMLValue = string | XMLObject | XMLValue[]
interface XMLObject {
  [key: string]: string | XMLValue
}

export default class StructuredData {
  private _data: object
  originFormat: "csv" | "json" | "xml" | "yaml"

  constructor(data: object, originFormat: "csv" | "json" | "xml" | "yaml") {
    this._data = data
    this.originFormat = originFormat
  }

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

  get data(): object {
    // data getter attempts to return data in a more javascript friendly way
    // the returned data will be suitable to be converted in json if required
    // however, if we wanted to convert the data into its native format
    // for example, converting back to xml - we need to know its original shape
    // that's the reason to maintain a separate _data field and a data getter
    switch (this.originFormat) {
      case "csv":
        throw new TypeError("Format not supported")
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

  toCsv(): string {
    throw new Error("Function not implemented.")
  }

  toJson(): string {
    throw new Error("Function not implemented.")
  }

  toXml(): string {
    throw new Error("Function not implemented.")
  }

  toYaml(): string {
    throw new Error("Function not implemented.")
  }

  async exportCsv(): Promise<void> {
    throw new Error("Function not implemented")
  }

  async exportJson(): Promise<void> {
    throw new Error("Function not implemented")
  }

  async exportXml(): Promise<void> {
    throw new Error("Function not implemented")
  }

  async exportYaml(): Promise<void> {
    throw new Error("Function not implemented")
  }
}
