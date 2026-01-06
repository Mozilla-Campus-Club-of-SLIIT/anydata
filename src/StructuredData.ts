import { compareArrays } from "./utils/common.js"
import type { YAMLValue, YAMLObject } from "./types/yaml.js"

type XMLValue = string | XMLObject | XMLValue[]

interface XMLObject {
  [key: string]: string | XMLValue
}

export default class StructuredData {
  private _data: object
  originFormat: "csv" | "json" | "xml" | "yaml" | "toml"

  constructor(data: object, originFormat: "csv" | "json" | "xml" | "yaml" | "toml") {
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

  /**
   * Private static method for processing YAML data for the data getter
   *
   * This method returns the YAML data directly since YAML data is already in a
   * JavaScript-friendly format after parsing. Unlike XML data which needs significant
   * transformation, YAML data maintains its structure and doesn't require additional
   * processing for the clean data getter.
   *
   * @param data - The parsed YAML object data
   * @returns The same YAML object (direct pass-through)
   *
   * @private
   * @static
   *
   * @example
   * ```typescript
   * const yamlData = {
   *   name: "John",
   *   age: 30,
   *   hobbies: ["reading", "coding"]
   * };
   *
   * const result = StructuredData._getYamlData(yamlData);
   * // Returns the exact same object: { name: "John", age: 30, hobbies: ["reading", "coding"] }
   * console.log(result === yamlData); // true (direct reference)
   * ```
   */
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
        return this._data
      case "xml":
        const rootKey = Object.keys(this._data)[0]
        const root = (this._data as XMLObject)[rootKey]
        return { [rootKey]: StructuredData._getXmlData(root) }
      case "yaml":
        return StructuredData._getYamlData(this._data as YAMLObject)
      case "json":
        return this._data
      case "toml":
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

  /**
   * Converts the StructuredData back to YAML format string
   *
   * This method serializes the internal data structure back into valid YAML format.
   * It only works on data that was originally loaded from YAML format to maintain
   * data integrity and preserve the original structure.
   *
   * Features:
   * - Preserves data types (strings, numbers, booleans, null)
   * - Maintains proper YAML indentation (2 spaces)
   * - Handles nested objects and arrays correctly
   * - Quotes strings that could be ambiguous (look like numbers, booleans, etc.)
   * - Supports empty objects and arrays
   * - Ensures round-trip compatibility
   *
   * @returns A valid YAML string representation of the data
   * @throws {Error} When called on data that was not originally in YAML format
   *
   * @example
   * ```typescript
   * // Load YAML data
   * const data = yaml.from(`
   *   name: John Doe
   *   age: 30
   *   hobbies:
   *     - reading
   *     - coding
   * `);
   *
   * // Convert back to YAML
   * const yamlString = data.toYaml();
   * console.log(yamlString);
   * // Output:
   * // name: John Doe
   * // age: 30
   * // hobbies:
   * //   - reading
   * //   - coding
   *
   * // Verify round-trip conversion
   * const roundTrip = yaml.from(yamlString);
   * assert.deepStrictEqual(data.data, roundTrip.data); // true
   * ```
   *
   * @example
   * ```typescript
   * // Error case - non-YAML data
   * const jsonData = new StructuredData({name: "John"}, "json");
   * jsonData.toYaml(); // Throws: Cannot convert to YAML: data was not originally in YAML format
   * ```
   */
  toYaml(): string {
    if (this.originFormat == "yaml") return this.serializeToYaml(this._data as YAMLObject)
    throw new Error("Operation not supported")
  }

  /**
   * Private helper method for recursively serializing data to YAML format
   *
   * This method handles the recursive traversal of nested data structures and
   * converts them to properly formatted YAML strings with correct indentation.
   *
   * @param data - The data to serialize (any valid YAML value type)
   * @param indent - Current indentation level (number of 2-space indents)
   * @returns A YAML string representation of the data
   *
   * @private
   *
   * Handles the following data types:
   * - `null`: Converts to "null"
   * - `string`: Quotes if contains special characters or looks like other types
   * - `number`/`boolean`: Direct string conversion
   * - `array`: Converts to YAML list format with "-" prefix
   * - `object`: Converts to YAML mapping format with key-value pairs
   * - Empty arrays/objects: Uses compact notation "[]" and "{}"
   *
   * @example
   * ```typescript
   * // Internal usage examples (private method):
   * serializeToYaml("hello", 0)           // "hello"
   * serializeToYaml("123", 0)             // "\"123\"" (quoted to prevent number parsing)
   * serializeToYaml(42, 0)                // "42"
   * serializeToYaml(true, 0)              // "true"
   * serializeToYaml(null, 0)              // "null"
   * serializeToYaml([], 0)                // "[]"
   * serializeToYaml({}, 0)                // "{}"
   * serializeToYaml({key: "value"}, 0)    // "key: value"
   * serializeToYaml(["a", "b"], 0)        // "- a\n- b"
   * ```
   */
  private serializeToYaml(data: YAMLValue, indent: number = 0): string {
    const indentStr = "  ".repeat(indent)

    if (data === null) {
      return "null"
    }

    if (typeof data === "string") {
      // Quote strings that contain special characters or look like other types
      if (
        data.includes(":") ||
        data.includes("#") ||
        data.includes("-") ||
        /^(true|false|null|yes|no|on|off|~)$/i.test(data) ||
        /^-?\d+(\.\d+)?$/.test(data) ||
        data.trim() !== data
      ) {
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
      return data
        .map((item) => {
          const serialized = this.serializeToYaml(item, indent + 1)
          if (typeof item === "object" && item !== null && !Array.isArray(item)) {
            const lines = serialized.split("\n")
            return `${indentStr}- ${lines[0]}\n${lines
              .slice(1)
              .map((line) => `  ${indentStr}${line}`)
              .join("\n")}`
          }
          return `${indentStr}- ${serialized}`
        })
        .join("\n")
    }

    if (typeof data === "object") {
      const entries = Object.entries(data)
      if (entries.length === 0) {
        return "{}"
      }

      return entries
        .map(([key, value]) => {
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
        })
        .join("\n")
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
