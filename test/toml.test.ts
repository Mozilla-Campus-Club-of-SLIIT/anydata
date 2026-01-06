import assert from "assert"
import { promises as fs } from "fs"
import { toml, StructuredData } from "../src/index.js"

describe("toml", () => {
  describe("loadFile", () => {
    const validToml = 'title = "TOML Example"\n[owner]\nname = "Tom"'

    before(async () => {
      await fs.writeFile("test.toml", validToml)
      await fs.writeFile("invalid.toml", "key = invalid = value")
    })

    after(async () => {
      try {
        await fs.unlink("test.toml")
        await fs.unlink("invalid.toml")
      } catch {
        // ignore
      }
    })

    it("should create a StructuredData object from a valid TOML file", async () => {
      const data = await toml.loadFile("test.toml")
      assert.ok(data instanceof StructuredData)
      assert.strictEqual((data.data as any).title, "TOML Example")
    })

    it("should throw error for invalid or missing files", async () => {
      await assert.rejects(async () => await toml.loadFile("invalid.toml"), { name: "TomlError" })
      await assert.rejects(
        async () => await toml.loadFile("missing.toml"),
        /no such file or directory/,
      )
    })
  })

  describe("from", () => {
    const parse = (input: string) => toml.from(input).data as any
    const shouldThrow = (input: string) => assert.throws(() => toml.from(input))

    it("should parse all types of keys correctly", () => {
      const data = parse(`
        bare_key = "v"
        "quoted key" = "v"
        'literal key' = "v"
        dotted.nested.key = "v"
        site."google.com" = true
        "" = "blank"
      `)
      assert.strictEqual(data.bare_key, "v")
      assert.strictEqual(data["quoted key"], "v")
      assert.strictEqual(data["literal key"], "v")
      assert.strictEqual(data.dotted.nested.key, "v")
      assert.strictEqual(data.site["google.com"], true)
      assert.strictEqual(data[""], "blank")
    })

    it("should parse all types of strings and escape sequences", () => {
      const data = parse(`
        basic = "str\\twith\\nnewline"
        multiline = """
Roses are red
Violets are blue"""
        backslash = """
The quick brown \\
  fox jumps over \\
    the lazy dog."""
        literal = 'C:\\Users\\node'
        multiline_literal = '''
The first newline is
trimmed in raw strings.'''
        escapes = "\\b\\f\\r\\e\\"\\\\\\u00A9\\U0001F600"
      `)
      assert.strictEqual(data.basic, "str\twith\nnewline")
      assert.strictEqual(data.multiline, "Roses are red\nViolets are blue")
      assert.strictEqual(data.backslash, "The quick brown fox jumps over the lazy dog.")
      assert.strictEqual(data.literal, "C:\\Users\\node")
      assert.strictEqual(data.multiline_literal, "The first newline is\ntrimmed in raw strings.")
      assert.strictEqual(data.escapes, '\b\f\r\x1B"\\\u00A9\u{1F600}')
    })

    it("should parse all numeric formats (integers, floats, hex, bin, oct)", () => {
      const data = parse(`
        int = +99
        neg = -17
        with_underscore = 1_000
        hex = 0xDEADBEEF
        oct = 0o755
        bin = 0b1101
        float = 3.1415
        exp = 5e+22
        inf = inf
        nan = nan
      `)
      assert.strictEqual(data.int, 99)
      assert.strictEqual(data.neg, -17)
      assert.strictEqual(data.with_underscore, 1000)
      assert.strictEqual(data.hex, 3735928559)
      assert.strictEqual(data.oct, 493)
      assert.strictEqual(data.bin, 13)
      assert.strictEqual(data.float, 3.1415)
      assert.strictEqual(data.exp, 5e22)
      assert.strictEqual(data.inf, Infinity)
      assert.ok(isNaN(data.nan))
    })

    it("should parse all date and time variations", () => {
      const data = parse(`
        odt = 1979-05-27T07:32:00Z
        ldt = 1979-05-27T07:32:00
        ld = 1979-05-27
        lt = 07:32:00
        frac = 1979-05-27T00:32:00.999999-07:00
      `)
      assert.ok(data.odt instanceof Date)
      assert.ok(data.ldt instanceof Date)
      assert.ok(data.ld instanceof Date)
      assert.ok(data.lt instanceof Date)
      assert.strictEqual(data.odt.toISOString(), "1979-05-27T07:32:00.000Z")
      assert.strictEqual(data.ld.toISOString().split("T")[0], "1979-05-27")
    })

    it("should parse complex structures (arrays, tables, inline tables)", () => {
      const data = parse(`
        arr = [ 1, 2, [3, 4], { x = 1 }, ]
        inline = { first = "Tom", last = "Werner", }
        [table]
        key = "value"
        [dog."tater.man"]
        type = "pug"

        [[products]]
        name = "Hammer"
        [[products]]
        [[products]]
        name = "Nail"
      `)
      assert.deepStrictEqual(data.arr[2], [3, 4])
      assert.strictEqual(data.arr[3].x, 1)
      assert.strictEqual(data.table.key, "value")
      assert.strictEqual(data.dog["tater.man"].type, "pug")
      assert.strictEqual(data.inline.last, "Werner")
      assert.strictEqual(data.products.length, 3)
      assert.strictEqual(data.products[0].name, "Hammer")
      assert.deepStrictEqual(data.products[1], {})
    })

    it("should handle comments and whitespace", () => {
      const data = parse(`
        # Full line comment
        key = "value" # Inline comment
        [section] # Table comment
        nested = 1
      `)
      assert.strictEqual(data.key, "value")
      assert.strictEqual(data.section.nested, 1)
    })

    it("should throw errors for invalid TOML syntax", () => {
      const cases = [
        'name = "A"\nname = "B"', // Duplicate key
        "arr = [1, 2", // Unclosed array
        "tbl = { a = 1", // Unclosed inline table
        "p = {x=1}\np.y=2", // Extend inline table
        "arr = []\n[[arr]]", // Append to static array
        "n = 042", // Leading zero
        "n = 1._0", // Malformed underscore
        "[a]\nb=1\n[a]", // Redefined table
      ]
      cases.forEach(shouldThrow)
    })
  })
})
