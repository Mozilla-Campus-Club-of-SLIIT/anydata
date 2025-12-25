import assert from "assert"
import { promises as fs } from "fs"
import { toml, StructuredData } from "../src/index.js"

describe("TOML", function () {
  // Helper functions to reduce repetition
  const parse = (tomlStr: string) => toml.from(tomlStr).data as any
  const shouldThrow = (tomlStr: string) => assert.throws(() => toml.from(tomlStr))
  const assertParse = (tomlStr: string, expected: Record<string, any>) => {
    const data = parse(tomlStr)
    Object.entries(expected).forEach(([key, value]) => {
      if (typeof value === "object" && !Array.isArray(value)) {
        assert.deepStrictEqual(data[key], value)
      } else {
        assert.strictEqual(data[key], value)
      }
    })
  }

  describe("loadFile", function () {
    const simpleToml = `title = "TOML Example"

[owner]
name = "Tom"
age = 30

[[products]]
name = "Hammer"
sku = 738594937

[[products]]
name = "Nail"
sku = 284758393`

    before(async () => {
      await fs.writeFile("test.toml", simpleToml)
      await fs.writeFile("invalid.toml", 'key = "unclosed string')
    })

    after(async () => {
      await fs.unlink("test.toml")
      await fs.unlink("invalid.toml")
    })

    it("should create a StructuredData object with a valid toml file", async function () {
      const data = await toml.loadFile("test.toml")
      assert.ok(data instanceof StructuredData)
      assert.strictEqual(data.originFormat, "toml")
      const payload = data.data as any
      assert.strictEqual(payload.title, "TOML Example")
      assert.strictEqual(payload.owner.name, "Tom")
      assert.strictEqual(payload.owner.age, 30)
      assert.strictEqual(payload.products.length, 2)
      assert.strictEqual(payload.products[0].name, "Hammer")
      assert.strictEqual(payload.products[1].sku, 284758393)
    })

    it("should throw an error for a file with invalid toml", async function () {
      await assert.rejects(async () => await toml.loadFile("invalid.toml"))
    })

    it("should throw an error if the file is not found", async function () {
      await assert.rejects(async () => await toml.loadFile("nonexistent.toml"), { name: "Error" })
    })
  })

  describe("Comment", function () {
    it("should ignore comments", function () {
      assertParse(
        `# Full-line comment\nkey = "value"  # End-of-line comment\nanother = "# Not a comment"`,
        { key: "value", another: "# Not a comment" },
      )
    })
  })

  describe("Key/Value Pair", function () {
    it("should parse basic key/value pairs", function () {
      assertParse(`   key   =   "value"   `, { key: "value" })
    })

    it("should reject invalid key/value pairs", function () {
      shouldThrow(`key = # Missing value`)
      shouldThrow(`first = "Tom" last = "Werner"`)
    })

    it("should parse all value types", function () {
      const data = parse(`
str = "string"
int = 42
flt = 3.14
bool = true
odt = 1979-05-27T07:32:00Z
ldt = 1979-05-27T07:32:00
ld = 1979-05-27
lt = 07:32:00
arr = [1, 2, 3]
tbl = { a = 1 }
`)
      assert.strictEqual(data.str, "string")
      assert.strictEqual(data.int, 42)
      assert.strictEqual(data.flt, 3.14)
      assert.strictEqual(data.bool, true)
      assert.ok(data.odt instanceof Date)
      assert.ok(Array.isArray(data.arr))
      assert.strictEqual(typeof data.tbl, "object")
    })
  })

  describe("Keys", function () {
    it("should parse bare keys", function () {
      const data = parse(`key = "value"\nbare_key = "value1"\nbare-key = "value2"\n1234 = "value3"`)
      assert.strictEqual(data.key, "value")
      assert.strictEqual(data.bare_key, "value1")
      assert.strictEqual(data["bare-key"], "value2")
      assert.strictEqual(data["1234"], "value3")
    })

    it("should parse quoted keys", function () {
      const data = parse(
        `"127.0.0.1" = "value"\n"character encoding" = "value"\n'key2' = "value"\n'quoted "value"' = "value"`,
      )
      assert.strictEqual(data["127.0.0.1"], "value")
      assert.strictEqual(data["character encoding"], "value")
      assert.strictEqual(data.key2, "value")
      assert.strictEqual(data['quoted "value"'], "value")
    })

    it("should allow empty quoted keys (discouraged)", function () {
      assert.strictEqual(parse(`"" = "blank"`)[""], "blank")
      assert.strictEqual(parse(`'' = 'blank'`)[""], "blank")
    })

    it("should reject invalid keys", function () {
      ;[`= "no key"`, `"""key""" = "not allowed"`, `spelling = "a"\n"spelling" = "b"`].forEach(
        shouldThrow,
      )
    })

    it("should parse dotted keys", function () {
      const data = parse(
        `name = "Orange"\nphysical.color = "orange"\nphysical.shape = "round"\nsite."google.com" = true\nfruit.name = "banana"\nfruit. color = "yellow"\nfruit . flavor = "banana"`,
      )
      assert.strictEqual(data.name, "Orange")
      assert.strictEqual(data.physical.color, "orange")
      assert.strictEqual(data.physical.shape, "round")
      assert.strictEqual(data.site["google.com"], true)
      assert.strictEqual(data.fruit.flavor, "banana")
    })

    it("should allow dotted keys out-of-order (discouraged)", function () {
      const data = parse(
        `apple.type = "fruit"\norange.type = "fruit"\napple.skin = "thin"\norange.skin = "thick"`,
      )
      assert.strictEqual(data.apple.type, "fruit")
      assert.strictEqual(data.apple.skin, "thin")
      assert.strictEqual(data.orange.type, "fruit")
      assert.strictEqual(data.orange.skin, "thick")
    })

    it("should parse numeric dotted keys", function () {
      assert.strictEqual(parse(`3.14159 = "pi"`)["3"]["14159"], "pi")
    })

    it("should reject duplicate keys", function () {
      shouldThrow(`name = "Tom"\nname = "Pradyun"`)
    })

    it("should reject assigning to non-table", function () {
      shouldThrow(`fruit.apple = 1\nfruit.apple.smooth = true`)
    })

    it("should allow writing to table before definition", function () {
      const data = parse(`fruit.apple.smooth = true\nfruit.orange = 2`)
      assert.strictEqual(data.fruit.apple.smooth, true)
      assert.strictEqual(data.fruit.orange, 2)
    })
  })

  describe("String", function () {
    it("should parse basic strings with escapes", function () {
      const data = parse(`
str = "I'm a string. \\"You can quote me\\". Name\\tJos\\u00E9\\nLocation\\tSF."
backspace = "\\b"
tab = "\\t"
linefeed = "\\n"
formfeed = "\\f"
carriage = "\\r"
quote = "\\""
backslash = "\\\\"
unicode4 = "\\u0041"
unicode8 = "\\U00000041"
`)
      assert.strictEqual(data.str, 'I\'m a string. "You can quote me". Name\tJosé\nLocation\tSF.')
      assert.strictEqual(data.backspace, "\b")
      assert.strictEqual(data.tab, "\t")
      assert.strictEqual(data.linefeed, "\n")
      assert.strictEqual(data.formfeed, "\f")
      assert.strictEqual(data.carriage, "\r")
      assert.strictEqual(data.quote, '"')
      assert.strictEqual(data.backslash, "\\")
      assert.strictEqual(data.unicode4, "A")
      assert.strictEqual(data.unicode8, "A")
    })

    it("should parse multi-line basic strings", function () {
      const data = parse(`
str1 = """
Roses are red
Violets are blue"""
str2 = """
The quick brown \\


  fox jumps over \\
    the lazy dog."""
str3 = """\\
       The quick brown \\
       fox jumps over \\
       the lazy dog.\\
       """
str4 = """Here are two quotation marks: "". Simple enough."""
str5 = """Here are three quotation marks: ""\\"."""
str7 = """"This," she said, "is just a pointless statement.""""
`)
      assert.strictEqual(data.str1, "Roses are red\nViolets are blue")
      assert.strictEqual(data.str2, "The quick brown fox jumps over the lazy dog.")
      assert.strictEqual(data.str2, data.str3)
      assert.strictEqual(data.str4, 'Here are two quotation marks: "". Simple enough.')
      assert.strictEqual(data.str5, 'Here are three quotation marks: """.')
      assert.strictEqual(data.str7, '"This," she said, "is just a pointless statement."')
    })

    it("should reject invalid multi-line string delimiters", function () {
      shouldThrow(`str5 = """Here are three: """."""`)
    })

    it("should parse literal strings", function () {
      const data = parse(`
winpath = 'C:\\Users\\nodejs\\templates'
winpath2 = '\\\\ServerX\\admin$\\system32\\'
quoted = 'Tom "Dubs" Preston-Werner'
regex = '<\\i\\c*\\s*>'
`)
      assert.strictEqual(data.winpath, "C:\\Users\\nodejs\\templates")
      assert.strictEqual(data.winpath2, "\\\\ServerX\\admin$\\system32\\")
      assert.strictEqual(data.quoted, 'Tom "Dubs" Preston-Werner')
      assert.strictEqual(data.regex, "<\\i\\c*\\s*>")
    })

    it("should parse multi-line literal strings", function () {
      const data = parse(`
regex2 = '''I [dw]on't need \\d{2} apples'''
lines = '''
The first newline is
trimmed in literal strings.
   All other whitespace
   is preserved.
'''
quot15 = '''Here are fifteen quotation marks: """""""""""""""'''
apos15 = "Here are fifteen apostrophes: '''''''''''''''"
str = ''''That,' she said, 'is still pointless.''''
`)
      assert.strictEqual(data.regex2, "I [dw]on't need \\d{2} apples")
      assert.ok(data.lines.includes("trimmed in literal strings."))
      assert.strictEqual(data.quot15, 'Here are fifteen quotation marks: """""""""""""""')
      assert.strictEqual(data.apos15, "Here are fifteen apostrophes: '''''''''''''''")
      assert.strictEqual(data.str, "'That,' she said, 'is still pointless.'")
    })

    it("should reject invalid literal strings", function () {
      shouldThrow(`apos15 = '''Here are fifteen: ''''''''''''''''''`)
    })
  })

  describe("Integer", function () {
    it("should parse integers", function () {
      const data = parse(
        `int1 = +99\nint2 = 42\nint3 = 0\nint4 = -17\nint5 = 1_000\nint6 = 5_349_221\nint7 = 53_49_221\nint8 = 1_2_3_4_5`,
      )
      assert.strictEqual(data.int1, 99)
      assert.strictEqual(data.int2, 42)
      assert.strictEqual(data.int3, 0)
      assert.strictEqual(data.int4, -17)
      assert.strictEqual(data.int5, 1000)
      assert.strictEqual(data.int6, 5349221)
      assert.strictEqual(data.int7, 5349221)
      assert.strictEqual(data.int8, 12345)
    })

    it("should parse special integer formats", function () {
      const data = parse(
        `hex1 = 0xDEADBEEF\nhex2 = 0xdeadbeef\nhex3 = 0xdead_beef\noct1 = 0o01234567\noct2 = 0o755\nbin1 = 0b11010110`,
      )
      assert.strictEqual(data.hex1, 3735928559)
      assert.strictEqual(data.hex2, 3735928559)
      assert.strictEqual(data.hex3, 3735928559)
      assert.strictEqual(data.oct1, 342391)
      assert.strictEqual(data.oct2, 493)
      assert.strictEqual(data.bin1, 214)
    })

    it("should handle zero variants", function () {
      assertParse(`zero1 = 0\nzero2 = +0`, { zero1: 0, zero2: 0 })
    })

    it("should reject invalid integers", function () {
      shouldThrow(`int = 042`)
      shouldThrow(`hex = +0xDEAD`)
    })
  })

  describe("Float", function () {
    it("should parse floats", function () {
      const data = parse(
        `flt1 = +1.0\nflt2 = 3.1415\nflt3 = -0.01\nflt4 = 5e+22\nflt5 = 1e06\nflt6 = -2E-2\nflt7 = 6.626e-34\nflt8 = 224_617.445_991_228`,
      )
      assert.strictEqual(data.flt1, 1.0)
      assert.strictEqual(data.flt2, 3.1415)
      assert.strictEqual(data.flt3, -0.01)
      assert.strictEqual(data.flt4, 5e22)
      assert.strictEqual(data.flt5, 1e6)
      assert.strictEqual(data.flt6, -0.02)
      assert.strictEqual(data.flt7, 6.626e-34)
      assert.strictEqual(data.flt8, 224617.445991228)
    })

    it("should parse special float values", function () {
      const data = parse(`sf1 = inf\nsf2 = +inf\nsf3 = -inf\nsf4 = nan\nsf5 = +nan\nsf6 = -nan`)
      assert.strictEqual(data.sf1, Infinity)
      assert.strictEqual(data.sf2, Infinity)
      assert.strictEqual(data.sf3, -Infinity)
      assert.ok(Number.isNaN(data.sf4))
      assert.ok(Number.isNaN(data.sf5))
      assert.ok(Number.isNaN(data.sf6))
    })

    it("should reject invalid floats", function () {
      ;[`invalid = .7`, `invalid = 7.`, `invalid = 3.e+20`].forEach(shouldThrow)
    })
  })

  describe("Boolean", function () {
    it("should parse booleans", function () {
      assertParse(`bool1 = true\nbool2 = false`, { bool1: true, bool2: false })
    })

    it("should reject capitalized booleans", function () {
      shouldThrow(`bool = True`)
      shouldThrow(`bool = FALSE`)
    })
  })

  describe("Date-Time", function () {
    it("should parse offset date-time", function () {
      const data = parse(`
odt1 = 1979-05-27T07:32:00Z
odt2 = 1979-05-27T00:32:00-07:00
odt3 = 1979-05-27T00:32:00.999999-07:00
odt4 = 1979-05-27 07:32:00Z
odt5 = 1979-05-27 07:32Z
`)
      assert.strictEqual(data.odt1.toISOString(), "1979-05-27T07:32:00.000Z")
      assert.ok(data.odt2 instanceof Date)
      assert.ok(data.odt3 instanceof Date)
      assert.ok(data.odt4 instanceof Date)
      assert.ok(data.odt5 instanceof Date)
    })

    it("should parse local date-time", function () {
      const data = parse(
        `ldt1 = 1979-05-27T07:32:00\nldt2 = 1979-05-27T07:32:00.999999\nldt3 = 1979-05-27T07:32`,
      )
      assert.ok(data.ldt1 instanceof Date)
      assert.ok(data.ldt2 instanceof Date)
      assert.ok(data.ldt3 instanceof Date)
    })

    it("should parse local date", function () {
      const data = parse(`ld1 = 1979-05-27`)
      const dateStr = data.ld1 instanceof Date ? data.ld1.toISOString() : data.ld1
      assert.ok(dateStr.includes("1979-05-27"))
    })

    it("should parse local time", function () {
      const data = parse(`lt1 = 07:32:00\nlt2 = 00:32:00.999999\nlt3 = 07:32`)
      assert.ok(data.lt1)
      assert.ok(data.lt2)
      assert.ok(data.lt3)
    })
  })

  describe("Array", function () {
    it("should parse arrays", function () {
      const data = parse(`
integers = [ 1, 2, 3 ]
colors = [ "red", "yellow", "green" ]
nested = [ [ 1, 2 ], [3, 4, 5] ]
mixed = [ [ 1, 2 ], ["a", "b", "c"] ]
numbers = [ 0.1, 0.2, 0.5, 1, 2, 5 ]
trailing = [1, 2, 3,]
multiline = [
  1,
  2, # comment
]
`)
      assert.deepStrictEqual(data.integers, [1, 2, 3])
      assert.deepStrictEqual(data.colors, ["red", "yellow", "green"])
      assert.deepStrictEqual(data.nested, [
        [1, 2],
        [3, 4, 5],
      ])
      assert.deepStrictEqual(data.mixed, [
        [1, 2],
        ["a", "b", "c"],
      ])
      assert.deepStrictEqual(data.numbers, [0.1, 0.2, 0.5, 1, 2, 5])
      assert.deepStrictEqual(data.trailing, [1, 2, 3])
      assert.deepStrictEqual(data.multiline, [1, 2])
    })

    it("should parse arrays with inline tables", function () {
      const data = parse(`
contributors = [
  "Foo Bar",
  { name = "Baz", email = "baz@example.com" }
]
points = [{ x = 1, y = 2 }, { x = 7, y = 8 }]
`)
      assert.strictEqual(data.contributors.length, 2)
      assert.strictEqual(data.contributors[1].name, "Baz")
      assert.strictEqual(data.points[0].x, 1)
      assert.strictEqual(data.points[1].x, 7)
    })
  })

  describe("Table", function () {
    it("should parse tables", function () {
      const data = parse(
        `[table-1]\nkey1 = "some string"\nkey2 = 123\n\n[table-2]\nkey1 = "another string"\nkey2 = 456`,
      )
      assert.strictEqual(data["table-1"].key1, "some string")
      assert.strictEqual(data["table-1"].key2, 123)
      assert.strictEqual(data["table-2"].key1, "another string")
      assert.strictEqual(data["table-2"].key2, 456)
    })

    it("should parse nested tables", function () {
      const data = parse(`[dog."tater.man"]\ntype.name = "pug"\n\n[a.b.c]\nx = 1\n[ d.e.f ]\nx = 2`)
      assert.strictEqual(data.dog["tater.man"].type.name, "pug")
      assert.strictEqual(data.a.b.c.x, 1)
      assert.strictEqual(data.d.e.f.x, 2)
    })

    it("should allow implicit super-table definition", function () {
      const data = parse(`[x.y.z.w]\na = 1\n\n[x]\nb = 2`)
      assert.strictEqual(data.x.y.z.w.a, 1)
      assert.strictEqual(data.x.b, 2)
    })

    it("should parse root table", function () {
      const data = parse(`name = "Fido"\nbreed = "pug"\n\n[owner]\nname = "Regina"`)
      assert.strictEqual(data.name, "Fido")
      assert.strictEqual(data.breed, "pug")
      assert.strictEqual(data.owner.name, "Regina")
    })

    it("should handle dotted keys creating tables", function () {
      const data = parse(
        `fruit.apple.color = "red"\nfruit.apple.taste.sweet = true\n\n[fruit.apple.texture]\nsmooth = true`,
      )
      assert.strictEqual(data.fruit.apple.color, "red")
      assert.strictEqual(data.fruit.apple.taste.sweet, true)
      assert.strictEqual(data.fruit.apple.texture.smooth, true)
    })

    it("should allow out-of-order tables (discouraged)", function () {
      const data = parse(`[fruit.apple]\na = 1\n[animal]\nb = 2\n[fruit.orange]\nc = 3`)
      assert.strictEqual(data.fruit.apple.a, 1)
      assert.strictEqual(data.animal.b, 2)
      assert.strictEqual(data.fruit.orange.c, 3)
    })

    it("should reject duplicate table definitions", function () {
      shouldThrow(`[fruit]\napple = "red"\n[fruit]\norange = "orange"`)
    })

    it("should reject redefining value as table", function () {
      shouldThrow(`[fruit]\napple = "red"\n[fruit.apple]\ntexture = "smooth"`)
    })

    it("should allow empty tables", function () {
      assert.deepStrictEqual(parse(`[empty]`).empty, {})
    })
  })

  describe("Inline Table", function () {
    it("should parse inline tables", function () {
      const data = parse(`
name = { first = "Tom", last = "Werner" }
point = {x=1, y=2}
empty = {}
animal = { type.name = "pug" }
trailing = {x=1, y=2,}
multiline = {
  a = 1,
  b = 2,
}
`)
      assert.strictEqual(data.name.first, "Tom")
      assert.strictEqual(data.name.last, "Werner")
      assert.strictEqual(data.point.x, 1)
      assert.deepStrictEqual(data.empty, {})
      assert.strictEqual(data.animal.type.name, "pug")
      assert.strictEqual(data.trailing.y, 2)
      assert.strictEqual(data.multiline.b, 2)
    })

    it("should reject modifying inline tables", function () {
      shouldThrow(`[product]\ntype = { name = "Nail" }\ntype.edible = false`)
      shouldThrow(`[product]\ntype.name = "Nail"\ntype = { edible = false }`)
    })
  })

  describe("Array of Tables", function () {
    it("should parse array of tables", function () {
      const data = parse(
        `[[product]]\nname = "Hammer"\nsku = 738594937\n\n[[product]]\n\n[[product]]\nname = "Nail"\nsku = 284758393\ncolor = "gray"`,
      )
      assert.strictEqual(data.product.length, 3)
      assert.strictEqual(data.product[0].name, "Hammer")
      assert.strictEqual(data.product[0].sku, 738594937)
      assert.deepStrictEqual(data.product[1], {})
      assert.strictEqual(data.product[2].name, "Nail")
      assert.strictEqual(data.product[2].color, "gray")
    })

    it("should parse array of tables with sub-tables", function () {
      const data = parse(`
[[fruits]]
name = "apple"

[fruits.physical]
color = "red"
shape = "round"

[[fruits.varieties]]
name = "red delicious"

[[fruits.varieties]]
name = "granny smith"

[[fruits]]
name = "banana"

[[fruits.varieties]]
name = "plantain"
`)
      assert.strictEqual(data.fruits.length, 2)
      assert.strictEqual(data.fruits[0].name, "apple")
      assert.strictEqual(data.fruits[0].physical.color, "red")
      assert.strictEqual(data.fruits[0].varieties.length, 2)
      assert.strictEqual(data.fruits[0].varieties[0].name, "red delicious")
      assert.strictEqual(data.fruits[1].name, "banana")
      assert.strictEqual(data.fruits[1].varieties[0].name, "plantain")
    })

    it("should reject invalid array of tables", function () {
      shouldThrow(`[fruit.physical]\ncolor = "red"\n[[fruit]]\nname = "apple"`)
      shouldThrow(
        `[[fruits]]\nname = "apple"\n[[fruits.varieties]]\nname = "red"\n[fruits.varieties]\nname = "smith"`,
      )
      shouldThrow(
        `[[fruits]]\nname = "apple"\n[fruits.physical]\ncolor = "red"\n[[fruits.physical]]\ncolor = "green"`,
      )
    })
  })

  describe("Compatibility", function () {
    it("should handle complex nested structures", function () {
      const data = parse(
        `[a.b.c]\nd = 1\n\n[[a.b.c.e]]\nf = 2\n\n[[a.b.c.e]]\nf = 3\n\n[a.b]\ng = 4`,
      )
      assert.strictEqual(data.a.b.c.d, 1)
      assert.strictEqual(data.a.b.c.e.length, 2)
      assert.strictEqual(data.a.b.c.e[0].f, 2)
      assert.strictEqual(data.a.b.c.e[1].f, 3)
      assert.strictEqual(data.a.b.g, 4)
    })

    it("should preserve data types", function () {
      const data = parse(`str = "42"\nint = 42\nflt = 42.0`)
      assert.strictEqual(typeof data.str, "string")
      assert.strictEqual(typeof data.int, "number")
      assert.strictEqual(typeof data.flt, "number")
      assert.strictEqual(data.str, "42")
      assert.strictEqual(data.int, 42)
      assert.strictEqual(data.flt, 42.0)
    })

    it("should handle all data types in one document", function () {
      const data = parse(`
str = "text"
int = 42
flt = 3.14
bool = true
date = 2023-01-01T00:00:00Z
arr = [1, 2]
tbl = { a = 1 }

[section]
key = "value"

[[items]]
name = "item1"
`)
      assert.strictEqual(data.str, "text")
      assert.strictEqual(data.int, 42)
      assert.strictEqual(data.flt, 3.14)
      assert.strictEqual(data.bool, true)
      assert.ok(data.date instanceof Date)
      assert.deepStrictEqual(data.arr, [1, 2])
      assert.strictEqual(data.tbl.a, 1)
      assert.strictEqual(data.section.key, "value")
      assert.strictEqual(data.items[0].name, "item1")
    })
  })
})
