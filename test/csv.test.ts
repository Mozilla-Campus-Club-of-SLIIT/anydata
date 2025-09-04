import assert from "assert"
import { promises as fs } from "fs"
import { csv, StructuredData } from "../src/index.js"

describe("csv", () => {
  describe("loadFile", () => {

    const simpleNoHeaderCsv = `Alice,30,Paris
Bob,25,London`

    const quotedNoHeaderCsv = `1,"An item, with comma"
2,"A ""quoted"" word"`

    const simpleHeaderCsv = `name,age,city
Alice,30,Paris
Bob,25,London`

    const quotedHeaderCsv = `id,desc
1,"An item, with comma"
2,"A ""quoted"" word"`

    before(async () => {
      await fs.writeFile("test.csv", simpleHeaderCsv)
      await fs.writeFile("quoted.csv", quotedHeaderCsv)
      await fs.writeFile("noheader.csv", simpleNoHeaderCsv)
      await fs.writeFile("noheader_quoted.csv", quotedNoHeaderCsv)
      // malformed csv: unclosed quote
      await fs.writeFile("invalid.csv", 'a,b\n1,"unterminated')
    })

    after(async () => {
      await fs.unlink("test.csv")
      await fs.unlink("quoted.csv")
      await fs.unlink("invalid.csv")
      await fs.unlink("noheader.csv")
      await fs.unlink("noheader_quoted.csv")
    })

    it("should create a StructuredData object with a valid csv file with headers", async () => {
      const data = await csv.loadFile("test.csv", { header: true })
      assert.ok(data instanceof StructuredData)
      assert.strictEqual(data.originFormat, "csv")
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload.length, 2)
      assert.strictEqual(payload[0].name, "Alice")
      assert.strictEqual(payload[1].city, "London")
    })

    it("should create a StructuredData object with a valid csv file without headers", async () => {
      const data = await csv.loadFile("noheader.csv", { header: false })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as string[][]
      assert.strictEqual(payload.length, 2)
      assert.strictEqual(payload[0][0], "Alice")
      assert.strictEqual(payload[1][2], "London")
    })

    it("should parse quoted fields correctly from file", async () => {
      const data = await csv.loadFile("quoted.csv", { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload[0].desc, "An item, with comma")
      assert.strictEqual(payload[1].desc, 'A "quoted" word')
    })

    it("should parse quoted fields correctly from file without headers", async () => {
      const data = await csv.loadFile("noheader_quoted.csv", { header: false })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as string[][]
      assert.strictEqual(payload[0][1], "An item, with comma")
      assert.strictEqual(payload[1][1], 'A "quoted" word')
    })

    it("should throw an error for a file with invalid csv", async () => {
      await assert.rejects(async () => await csv.loadFile("invalid.csv", { header: true }), {
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

    it("should create a StructuredData object when header option is ignored", () => {
      const text = "Alice,30,Paris\nBob,25,London"
      const data1 = csv.from(text)
      assert.ok(data1 instanceof StructuredData)
      const payload = data1.data as string[][]
      assert.strictEqual(payload.length, 2)
      assert.strictEqual(payload[0][0], "Alice")
      assert.strictEqual(payload[1][2], "London")

      const data2 = csv.from(text, {})
      assert.ok(data2 instanceof StructuredData)
      const payload2 = data2.data as string[][]
      assert.strictEqual(payload2.length, 2)
      assert.strictEqual(payload2[0][0], "Alice")
      assert.strictEqual(payload2[1][2], "London")
    })

    it("should create a StructuredData object with valid csv when headers is false", () => {
      const text = "a,b\n1,2\n3,4"
      const data = csv.from(text, { header: false })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as string[][]
      assert.strictEqual(payload.length, 3)
      assert.strictEqual(payload[0][0], "a")
      assert.strictEqual(payload[1][1], "2")
      assert.strictEqual(payload[2][0], "3")
    })

    it("should create a StructuredData object with valid csv including headers", () => {
      const text = "a,b\n1,2\n3,4"
      const data = csv.from(text, { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload.length, 2)
      assert.strictEqual(payload[0].a, "1")
    })

    it("should parse quoted fields and escaped quotes", () => {
      const text = 'id,desc\n1,"Hello, world"\n2,"She said ""Hi"""'
      const data = csv.from(text, { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload[0].desc, "Hello, world")
      assert.strictEqual(payload[1].desc, 'She said "Hi"')
    })

    it("should handle empty input", () => {
      const text = ""
      const data = csv.from(text, { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload.length, 0)
    })

    it("should handle input with only newlines", () => {
      const text = "\n\n"
      const data = csv.from(text, { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload.length, 0)
    })

    it("should handle ambigious newlines within quoted fields", () => {
      const text = 'id,desc\n1,"Hello\nworld"\n2,"Line1\r\nLine2"'
      const data = csv.from(text, { header: true })
      assert.ok(data instanceof StructuredData)
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload.length, 2)
      assert.strictEqual(payload[0].desc, "Hello\nworld")
      assert.strictEqual(payload[1].desc, "Line1\r\nLine2")
    })

    it("should handle rows with missing columns by filling empty strings", () => {
      const text = "col1,col2\nval1\nval2,valb"
      const data = csv.from(text, { header: true })
      const payload = data.data as Record<string, string>[]
      assert.strictEqual(payload[0].col2, "")
      assert.strictEqual(payload[1].col2, "valb")
    })

    it("should throw for malformed csv (unclosed quote)", () => {
      assert.throws(() => csv.from('a,b\n1,"unterminated', { header: true }), {
        name: "SyntaxError",
      })
    })
  })
})
