import assert from "assert"
import { any } from "../src/index.js"
import { it } from "mocha"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe("parse", () => {
  // Temp file path for tests
  const tempDir = path.join(__dirname, "temp")

  before(() => {
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir)
    }
  })

  after(() => {
    // Clean up temp directory after all tests (rm -rf)
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe("from", () => {
    it("should detect and parse JSON data from string", () => {
      const jsonData = '{"name":"John","age":30}'
      const result = any.from(jsonData)

      assert.deepStrictEqual(result!.data, { name: "John", age: 30 })
    })

    it("should detect and parse XML data from string", () => {
      const xmlData = "<person><name>John</name><age>30</age></person>"
      const result = any.from(xmlData)

      assert.deepStrictEqual(result!.data, { person: { name: "John", age: "30" } })
    })

    it("should throw an error for unparseable data", () => {
      const invalidData = "This is not valid in any supported format"
      assert.throws(() => any.from(invalidData), Error)
    })

    it("should return null for unparseable data when suppressErrors is true", () => {
      const invalidData = "This is not valid in any supported format"
      const result = any.from(invalidData, true)
      assert.strictEqual(result, null)
    })
  })

  describe("loadFile", () => {
    it("should detect and parse JSON data from file", async () => {
      const filePath = path.join(tempDir, "test.json")
      const jsonData = '{"name":"John","age":30}'

      fs.writeFileSync(filePath, jsonData)

      const result = await any.loadFile(filePath)

      assert.deepStrictEqual(result!.data, { name: "John", age: 30 })
    })

    it("should detect and parse XML data from file", async () => {
      const filePath = path.join(tempDir, "test.xml")
      const xmlData = "<person><name>John</name><age>30</age></person>"

      fs.writeFileSync(filePath, xmlData)

      const result = await any.loadFile(filePath)

      assert.deepStrictEqual(result!.data, { person: { name: "John", age: "30" } })
    })

    it("should detect format regardless of file extension", async () => {
      const filePath = path.join(tempDir, "test.txt")
      const jsonData = '{"name":"John","age":30}'

      fs.writeFileSync(filePath, jsonData)

      const result = await any.loadFile(filePath)

      assert.deepStrictEqual(result!.data, { name: "John", age: 30 })
    })

    it("should throw an error for unparseable file", async () => {
      const filePath = path.join(tempDir, "invalid.txt")
      const invalidData = "This is not valid in any supported format"

      fs.writeFileSync(filePath, invalidData)

      await assert.rejects(async () => {
        await any.loadFile(filePath)
      }, Error)
    })

    it("should return null for unparseable file when suppressErrors is true", async () => {
      const filePath = path.join(tempDir, "invalid.txt")
      const invalidData = "This is not valid in any supported format"

      fs.writeFileSync(filePath, invalidData)

      const result = await any.loadFile(filePath, true)
      assert.strictEqual(result, null)
    })

    it("should return null for non-existent file when suppressErrors is true", async () => {
      const filePath = path.join(tempDir, "does-not-exist.json")

      // Make sure the file doesn't exist
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      const result = await any.loadFile(filePath, true)
      assert.strictEqual(result, null)
    })
  })

  describe("Edge cases", () => {
    it("should handle empty input", () => {
      assert.throws(() => any.from(""), Error)
    })

    it("should handle empty input with suppressErrors", () => {
      const result = any.from("", true)
      assert.strictEqual(result, null)
    })

    it("should handle whitespace-only input", () => {
      assert.throws(() => any.from("   \n   "), Error)
    })

    it("should handle whitespace-only input with suppressErrors", () => {
      const result = any.from("   \n   ", true)
      assert.strictEqual(result, null)
    })

    it("should handle ambiguous formats", () => {
      // This string looks like XML but is actually valid JSON
      const ambiguousData = '{"tag": "<element>value</element>"}'

      const result = any.from(ambiguousData)

      const data = result!.data as { tag: string }
      assert.strictEqual(data.tag, "<element>value</element>")
    })
  })
})
