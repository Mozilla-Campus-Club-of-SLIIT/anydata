import assert from "assert"
import { promises as fs } from "fs"
import { csv, StructuredData } from "../src/index.js"

describe("csv", () => {
  describe("loadFile", () => {
    const simpleCsv = `name,age,city
Alice,30,Paris
Bob,25,London`

    const quotedCsv = `id,desc
1,"An item, with comma"
2,"A ""quoted"" word"`

    before(async () => {
      await fs.writeFile("test.csv", simpleCsv)
      await fs.writeFile("quoted.csv", quotedCsv)
      // malformed csv: unclosed quote
      await fs.writeFile("invalid.csv", "a,b\n1,\"unterminated")
    })

    after(async () => {
      await fs.unlink("test.csv")
      await fs.unlink("quoted.csv")
      await fs.unlink("invalid.csv")
    })

    it("should create a StructuredData object with a valid csv file", async () => {
      const data = await csv.loadFile("test.csv")
      assert.ok(data instanceof StructuredData)
      assert.strictEqual(data.originFormat, "csv")
  const payload = data.data as { header: string[]; rows: Record<string, string>[] }
      assert.strictEqual(payload.rows.length, 2)
      assert.deepStrictEqual(payload.header, ["name", "age", "city"]) 
      assert.strictEqual(payload.rows[0].name, "Alice")
      assert.strictEqual(payload.rows[1].city, "London")
    })

    it("should parse quoted fields correctly from file", async () => {
      const data = await csv.loadFile("quoted.csv")
      assert.ok(data instanceof StructuredData)
  const payload = data.data as { header: string[]; rows: Record<string, string>[] }
  assert.strictEqual(payload.rows[0].desc, "An item, with comma")
  assert.strictEqual(payload.rows[1].desc, "A \"quoted\" word")
    })

    it("should throw an error for a file with invalid csv", async () => {
      await assert.rejects(async () => await csv.loadFile("invalid.csv"), {
        name: "SyntaxError",
      })
    })

    it("should throw an error if the file is not found", async () => {
      await assert.rejects(async () => await csv.loadFile("nonexistent.csv"), {
        name: "Error",
      })
    })
  })

  describe("from", () => {
    it("should create a StructuredData object with valid csv", () => {
      const text = "a,b\n1,2\n3,4"
      const data = csv.from(text)
      assert.ok(data instanceof StructuredData)
  const payload = data.data as { header: string[]; rows: Record<string, string>[] }
      assert.strictEqual(payload.rows.length, 2)
      assert.deepStrictEqual(payload.header, ["a", "b"])
      assert.strictEqual(payload.rows[0].a, "1")
    })

    it("should parse quoted fields and escaped quotes", () => {
  const text = "id,desc\n1,\"Hello, world\"\n2,\"She said \"\"Hi\"\"\""
      const data = csv.from(text)
  assert.ok(data instanceof StructuredData)
  const payload = data.data as { header: string[]; rows: Record<string, string>[] }
  assert.strictEqual(payload.rows[0].desc, "Hello, world")
  assert.strictEqual(payload.rows[1].desc, "She said \"Hi\"")
    })

    it("should handle rows with missing columns by filling empty strings", () => {
      const text = "col1,col2\nval1\nval2,valb"
      const data = csv.from(text)
  const payload = data.data as { header: string[]; rows: Record<string, string>[] }
      assert.strictEqual(payload.rows[0].col2, "")
      assert.strictEqual(payload.rows[1].col2, "valb")
    })

    it("should throw for malformed csv (unclosed quote)", () => {
      assert.throws(() => csv.from("a,b\n1,\"unterminated"), {
        name: "SyntaxError",
      })
    })
  })
})
