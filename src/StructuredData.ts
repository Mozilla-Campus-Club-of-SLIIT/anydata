export default class StructuredData {
  private _data: object
  originFormat: "csv" | "json" | "xml" | "yaml"

  constructor(data: object, originFormat: "csv" | "json" | "xml" | "yaml") {
    this._data = data
    this.originFormat = originFormat
  }

  get data(): object {
    switch (this.originFormat) {
      case "csv":
      case "xml":
        // return data as is for now
        // todo: return xml in a more json-friendly format without deeply nested objects
        return this._data
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
