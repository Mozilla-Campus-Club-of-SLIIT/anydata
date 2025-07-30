import { compareArrays } from "./utils/common.js"

type XMLValue = string | XMLObject | XMLValue[]
interface XMLObject {
  [key: string]: string | XMLValue
}

type YAMLValue = string | number | boolean | null | YAMLObject | YAMLValue[]
interface YAMLObject {
  [key: string]: YAMLValue
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

  private static _getYamlData = (data: YAMLObject): YAMLObject => {
    // Return the data directly since we're now passing parsed YAML objects
    return data
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
        return StructuredData._getYamlData(this._data as YAMLObject)
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
    if (this.originFormat !== "yaml") {
      throw new Error("Cannot convert to YAML: data was not originally in YAML format")
    }
    return this.serializeToYaml(this._data as YAMLObject)
  }

  private serializeToYaml(data: YAMLValue, indent: number = 0): string {
    const indentStr = "  ".repeat(indent)

    if (data === null) {
      return "null"
    }

    if (typeof data === "string") {
      // Quote strings that contain special characters or look like other types
      if (data.includes(":") || data.includes("#") || data.includes("-") ||
        /^(true|false|null|yes|no|on|off|~)$/i.test(data) ||
        /^-?\d+(\.\d+)?$/.test(data) ||
        data.trim() !== data) {
        return `"${data}"`
      }
      return data
    }

    if (typeof data === "number" || typeof data === "boolean") {
      return String(data)
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return "[]"
      }
      return data.map(item => {
        const serialized = this.serializeToYaml(item, indent + 1)
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const lines = serialized.split("\n")
          return `${indentStr}- ${lines[0]}\n${lines.slice(1).map(line => `  ${indentStr}${line}`).join("\n")}`
        }
        return `${indentStr}- ${serialized}`
      }).join("\n")
    }

    if (typeof data === "object") {
      const entries = Object.entries(data)
      if (entries.length === 0) {
        return "{}"
      }

      return entries.map(([key, value]) => {
        const serializedValue = this.serializeToYaml(value, indent + 1)

        if (typeof value === "object" && value !== null) {
          if (Array.isArray(value) && value.length > 0) {
            return `${indentStr}${key}:\n${serializedValue}`
          } else if (!Array.isArray(value) && Object.keys(value).length > 0) {
            return `${indentStr}${key}:\n${serializedValue}`
          } else {
            return `${indentStr}${key}: ${serializedValue}`
          }
        } else {
          return `${indentStr}${key}: ${serializedValue}`
        }
      }).join("\n")
    }

    return String(data)
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
