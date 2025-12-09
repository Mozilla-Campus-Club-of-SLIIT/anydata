import assert from "assert"
import { promises as fs } from "fs"
import { json, StructuredData } from "../src/index.js"

describe("json", () => {
  describe("loadFile", () => {
    // Shared reference object reused across file tests
    const rData = {
      name: "Test",
      value: 123,
      nested: {
        key: "value",
      },
    }

    before(async () => {
      // create file with valid json
      await fs.writeFile("test.json", JSON.stringify(rData, null, 2))
      // create file with invalid json
      await fs.writeFile("invalid.json", "{a:'invalid json'}")
    })

    after(async () => {
      // clean up files
      await fs.unlink("test.json")
      await fs.unlink("invalid.json")
    })

    it("should create a StructuredData object with a valid json file", async () => {
      const data = await json.loadFile("test.json")

      assert.ok(data instanceof StructuredData)
      assert.deepStrictEqual(data.data, rData)
    })

    it("should throw an error for a file with invalid json", async () => {
      assert.rejects(async () => await json.loadFile("invalid.json"), {
        name: "SyntaxError",
        message: "Unexpected token a in JSON at position 1",
      })
    })

    it("should throw an error if the file is not found", async () => {
      assert.rejects(async () => await json.loadFile("nonexistent.json"), {
        name: "Error",
        message: "ENOENT: no such file or directory, open 'nonexistent.json'",
      })
    })
  })

  describe("from", () => {
    // Direct string parsing without touching the filesystem
    it("should create a StructuredData object with valid json", async () => {
      const rData = {
        name: "Test",
        value: 123,
        nested: {
          key: "value",
        },
      }
      const data = json.from(JSON.stringify(rData))

      assert.ok(data instanceof StructuredData)
      assert.deepStrictEqual(data.data, rData)
    })

    it("should throw an error for invalid json", async () => {
      assert.throws(() => json.from("this is not valid json"))
      assert.throws(() => json.from("{a:'invalid key and single quotes'}"))
    })
  })
})
