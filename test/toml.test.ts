import assert from "assert"
import { promises as fs } from "fs"
import { toml, StructuredData } from "../src/index.js"

describe("TOML", function () {
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

    before(async function () {
      await fs.writeFile("test.toml", simpleToml)
      await fs.writeFile("invalid.toml", 'key = "unclosed string')
    })

    after(async function () {
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
      await assert.rejects(async () => await toml.loadFile("nonexistent.toml"), {
        name: "Error",
      })
    })
  })

  describe("Comment", function () {
    it("should ignore comments", function () {
      const data = toml.from(`
# Full-line comment
key = "value"  # End-of-line comment
another = "# Not a comment"
`).data as any
      assert.strictEqual(data.key, "value")
      assert.strictEqual(data.another, "# Not a comment")
    })
  })

  describe("Key/Value Pair", function () {
    it("should parse basic key/value pairs", function () {
      const data = toml.from(`   key   =   "value"   `).data as any
      assert.strictEqual(data.key, "value")
    })

    it("should reject invalid key/value pairs", function () {
      assert.throws(() => toml.from(`key = # Missing value`))
      assert.throws(() => toml.from(`first = "Tom" last = "Werner"`))
    })

    it("should parse all value types", function () {
      const data = toml.from(`
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
`).data as any
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
      const data = toml.from(`
key = "value"
bare_key = "value1"
bare-key = "value2"
1234 = "value3"
`).data as any
      assert.strictEqual(data.key, "value")
      assert.strictEqual(data.bare_key, "value1")
      assert.strictEqual(data["bare-key"], "value2")
      assert.strictEqual(data["1234"], "value3")
    })

    it("should parse quoted keys", function () {
      const data = toml.from(`
"127.0.0.1" = "value"
"character encoding" = "value"
'key2' = "value"
'quoted "value"' = "value"
`).data as any
      assert.strictEqual(data["127.0.0.1"], "value")
      assert.strictEqual(data["character encoding"], "value")
      assert.strictEqual(data.key2, "value")
      assert.strictEqual(data['quoted "value"'], "value")
    })

    it("should allow empty quoted keys (discouraged)", function () {
      const data1 = toml.from(`"" = "blank"`).data as any
      const data2 = toml.from(`'' = 'blank'`).data as any
      assert.strictEqual(data1[""], "blank")
      assert.strictEqual(data2[""], "blank")
    })

    it("should reject invalid keys", function () {
      assert.throws(() => toml.from(`= "no key"`))
      assert.throws(() => toml.from(`"""key""" = "not allowed"`))
      assert.throws(() => toml.from(`spelling = "a"\n"spelling" = "b"`))
    })

    it("should parse dotted keys", function () {
      const data = toml.from(`
name = "Orange"
physical.color = "orange"
physical.shape = "round"
site."google.com" = true
fruit.name = "banana"
fruit. color = "yellow"
fruit . flavor = "banana"
`).data as any
      assert.strictEqual(data.name, "Orange")
      assert.strictEqual(data.physical.color, "orange")
      assert.strictEqual(data.physical.shape, "round")
      assert.strictEqual(data.site["google.com"], true)
      assert.strictEqual(data.fruit.flavor, "banana")
    })

    it("should allow dotted keys out-of-order (discouraged)", function () {
      const data = toml.from(`
apple.type = "fruit"
orange.type = "fruit"
apple.skin = "thin"
orange.skin = "thick"
`).data as any
      assert.strictEqual(data.apple.type, "fruit")
      assert.strictEqual(data.apple.skin, "thin")
      assert.strictEqual(data.orange.type, "fruit")
      assert.strictEqual(data.orange.skin, "thick")
    })

    it("should parse numeric dotted keys", function () {
      const data = toml.from(`3.14159 = "pi"`).data as any
      assert.strictEqual(data["3"]["14159"], "pi")
    })

    it("should reject duplicate keys", function () {
      assert.throws(() => toml.from(`name = "Tom"\nname = "Pradyun"`))
    })

    it("should reject assigning to non-table", function () {
      assert.throws(() => toml.from(`fruit.apple = 1\nfruit.apple.smooth = true`))
    })

    it("should allow writing to table before definition", function () {
      const data = toml.from(`fruit.apple.smooth = true\nfruit.orange = 2`).data as any
      assert.strictEqual(data.fruit.apple.smooth, true)
      assert.strictEqual(data.fruit.orange, 2)
    })
  })

  describe("String", function () {
    it("should parse basic strings with escapes", function () {
      const data = toml.from(`
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
`).data as any
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
      const data = toml.from(`
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
`).data as any
      assert.strictEqual(data.str1, "Roses are red\nViolets are blue")
      assert.strictEqual(data.str2, "The quick brown fox jumps over the lazy dog.")
      assert.strictEqual(data.str2, data.str3)
      assert.strictEqual(data.str4, 'Here are two quotation marks: "". Simple enough.')
      assert.strictEqual(data.str5, 'Here are three quotation marks: """.')
      assert.strictEqual(data.str7, '"This," she said, "is just a pointless statement."')
    })

    it("should reject invalid multi-line string delimiters", function () {
      assert.throws(() => toml.from(`str5 = """Here are three: """."""`))
    })

    it("should parse literal strings", function () {
      const data = toml.from(`
winpath = 'C:\\Users\\nodejs\\templates'
winpath2 = '\\\\ServerX\\admin$\\system32\\'
quoted = 'Tom "Dubs" Preston-Werner'
regex = '<\\i\\c*\\s*>'
`).data as any
      assert.strictEqual(data.winpath, "C:\\Users\\nodejs\\templates")
      assert.strictEqual(data.winpath2, "\\\\ServerX\\admin$\\system32\\")
      assert.strictEqual(data.quoted, 'Tom "Dubs" Preston-Werner')
      assert.strictEqual(data.regex, "<\\i\\c*\\s*>")
    })

    it("should parse multi-line literal strings", function () {
      const data = toml.from(`
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
`).data as any
      assert.strictEqual(data.regex2, "I [dw]on't need \\d{2} apples")
      assert.ok(data.lines.includes("trimmed in literal strings."))
      assert.strictEqual(data.quot15, 'Here are fifteen quotation marks: """""""""""""""')
      assert.strictEqual(data.apos15, "Here are fifteen apostrophes: '''''''''''''''")
      assert.strictEqual(data.str, "'That,' she said, 'is still pointless.'")
    })

    it("should reject invalid literal strings", function () {
      assert.throws(() => toml.from(`apos15 = '''Here are fifteen: ''''''''''''''''''`))
    })
  })

  describe("Integer", function () {
    it("should parse integers", function () {
      const data = toml.from(`
int1 = +99
int2 = 42
int3 = 0
int4 = -17
int5 = 1_000
int6 = 5_349_221
int7 = 53_49_221
int8 = 1_2_3_4_5
`).data as any
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
      const data = toml.from(`
hex1 = 0xDEADBEEF
hex2 = 0xdeadbeef
hex3 = 0xdead_beef
oct1 = 0o01234567
oct2 = 0o755
bin1 = 0b11010110
`).data as any
      assert.strictEqual(data.hex1, 3735928559)
      assert.strictEqual(data.hex2, 3735928559)
      assert.strictEqual(data.hex3, 3735928559)
      assert.strictEqual(data.oct1, 342391)
      assert.strictEqual(data.oct2, 493)
      assert.strictEqual(data.bin1, 214)
    })

    it("should handle zero variants", function () {
      const data = toml.from(`zero1 = 0\nzero2 = +0`).data as any
      assert.strictEqual(data.zero1, 0)
      assert.strictEqual(data.zero2, 0)
    })

    it("should reject invalid integers", function () {
      assert.throws(() => toml.from(`int = 042`))
      assert.throws(() => toml.from(`hex = +0xDEAD`))
    })
  })

  describe("Float", function () {
    it("should parse floats", function () {
      const data = toml.from(`
flt1 = +1.0
flt2 = 3.1415
flt3 = -0.01
flt4 = 5e+22
flt5 = 1e06
flt6 = -2E-2
flt7 = 6.626e-34
flt8 = 224_617.445_991_228
`).data as any
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
      const data = toml.from(`
sf1 = inf
sf2 = +inf
sf3 = -inf
sf4 = nan
sf5 = +nan
sf6 = -nan
`).data as any
      assert.strictEqual(data.sf1, Infinity)
      assert.strictEqual(data.sf2, Infinity)
      assert.strictEqual(data.sf3, -Infinity)
      assert.ok(Number.isNaN(data.sf4))
      assert.ok(Number.isNaN(data.sf5))
      assert.ok(Number.isNaN(data.sf6))
    })

    it("should reject invalid floats", function () {
      assert.throws(() => toml.from(`invalid = .7`))
      assert.throws(() => toml.from(`invalid = 7.`))
      assert.throws(() => toml.from(`invalid = 3.e+20`))
    })
  })

  describe("Boolean", function () {
    it("should parse booleans", function () {
      const data = toml.from(`bool1 = true\nbool2 = false`).data as any
      assert.strictEqual(data.bool1, true)
      assert.strictEqual(data.bool2, false)
    })

    it("should reject capitalized booleans", function () {
      assert.throws(() => toml.from(`bool = True`))
      assert.throws(() => toml.from(`bool = FALSE`))
    })
  })

  describe("Date-Time", function () {
    it("should parse offset date-time", function () {
      const data = toml.from(`
odt1 = 1979-05-27T07:32:00Z
odt2 = 1979-05-27T00:32:00-07:00
odt3 = 1979-05-27T00:32:00.999999-07:00
odt4 = 1979-05-27 07:32:00Z
odt5 = 1979-05-27 07:32Z
`).data as any
      assert.strictEqual(data.odt1.toISOString(), "1979-05-27T07:32:00.000Z")
      assert.ok(data.odt2 instanceof Date)
      assert.ok(data.odt3 instanceof Date)
      assert.ok(data.odt4 instanceof Date)
      assert.ok(data.odt5 instanceof Date)
    })

    it("should parse local date-time", function () {
      const data = toml.from(`
ldt1 = 1979-05-27T07:32:00
ldt2 = 1979-05-27T07:32:00.999999
ldt3 = 1979-05-27T07:32
`).data as any
      assert.ok(data.ldt1 instanceof Date)
      assert.ok(data.ldt2 instanceof Date)
      assert.ok(data.ldt3 instanceof Date)
    })

    it("should parse local date", function () {
      const data = toml.from(`ld1 = 1979-05-27`).data as any
      const dateStr = data.ld1 instanceof Date ? data.ld1.toISOString() : data.ld1
      assert.ok(dateStr.includes("1979-05-27"))
    })

    it("should parse local time", function () {
      const data = toml.from(`
lt1 = 07:32:00
lt2 = 00:32:00.999999
lt3 = 07:32
`).data as any
      assert.ok(data.lt1)
      assert.ok(data.lt2)
      assert.ok(data.lt3)
    })
  })

  describe("Array", function () {
    it("should parse arrays", function () {
      const data = toml.from(`
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
`).data as any
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
      const data = toml.from(`
contributors = [
  "Foo Bar",
  { name = "Baz", email = "baz@example.com" }
]
points = [{ x = 1, y = 2 }, { x = 7, y = 8 }]
`).data as any
      assert.strictEqual(data.contributors.length, 2)
      assert.strictEqual(data.contributors[1].name, "Baz")
      assert.strictEqual(data.points[0].x, 1)
      assert.strictEqual(data.points[1].x, 7)
    })
  })

  describe("Table", function () {
    it("should parse tables", function () {
      const data = toml.from(`
[table-1]
key1 = "some string"
key2 = 123

[table-2]
key1 = "another string"
key2 = 456
`).data as any
      assert.strictEqual(data["table-1"].key1, "some string")
      assert.strictEqual(data["table-1"].key2, 123)
      assert.strictEqual(data["table-2"].key1, "another string")
      assert.strictEqual(data["table-2"].key2, 456)
    })

    it("should parse nested tables", function () {
      const data = toml.from(`
[dog."tater.man"]
type.name = "pug"

[a.b.c]
x = 1
[ d.e.f ]
x = 2
`).data as any
      assert.strictEqual(data.dog["tater.man"].type.name, "pug")
      assert.strictEqual(data.a.b.c.x, 1)
      assert.strictEqual(data.d.e.f.x, 2)
    })

    it("should allow implicit super-table definition", function () {
      const data = toml.from(`
[x.y.z.w]
a = 1

[x]
b = 2
`).data as any
      assert.strictEqual(data.x.y.z.w.a, 1)
      assert.strictEqual(data.x.b, 2)
    })

    it("should parse root table", function () {
      const data = toml.from(`
name = "Fido"
breed = "pug"

[owner]
name = "Regina"
`).data as any
      assert.strictEqual(data.name, "Fido")
      assert.strictEqual(data.breed, "pug")
      assert.strictEqual(data.owner.name, "Regina")
    })

    it("should handle dotted keys creating tables", function () {
      const data = toml.from(`
fruit.apple.color = "red"
fruit.apple.taste.sweet = true

[fruit.apple.texture]
smooth = true
`).data as any
      assert.strictEqual(data.fruit.apple.color, "red")
      assert.strictEqual(data.fruit.apple.taste.sweet, true)
      assert.strictEqual(data.fruit.apple.texture.smooth, true)
    })

    it("should allow out-of-order tables (discouraged)", function () {
      const data = toml.from(`
[fruit.apple]
a = 1
[animal]
b = 2
[fruit.orange]
c = 3
`).data as any
      assert.strictEqual(data.fruit.apple.a, 1)
      assert.strictEqual(data.animal.b, 2)
      assert.strictEqual(data.fruit.orange.c, 3)
    })

    it("should reject duplicate table definitions", function () {
      assert.throws(() => toml.from(`[fruit]\napple = "red"\n[fruit]\norange = "orange"`))
    })

    it("should reject redefining value as table", function () {
      assert.throws(() => toml.from(`[fruit]\napple = "red"\n[fruit.apple]\ntexture = "smooth"`))
    })

    it("should allow empty tables", function () {
      const data = toml.from(`[empty]`).data as any
      assert.deepStrictEqual(data.empty, {})
    })
  })

  describe("Inline Table", function () {
    it("should parse inline tables", function () {
      const data = toml.from(`
name = { first = "Tom", last = "Werner" }
point = {x=1, y=2}
empty = {}
animal = { type.name = "pug" }
trailing = {x=1, y=2,}
multiline = {
  a = 1,
  b = 2,
}
`).data as any
      assert.strictEqual(data.name.first, "Tom")
      assert.strictEqual(data.name.last, "Werner")
      assert.strictEqual(data.point.x, 1)
      assert.deepStrictEqual(data.empty, {})
      assert.strictEqual(data.animal.type.name, "pug")
      assert.strictEqual(data.trailing.y, 2)
      assert.strictEqual(data.multiline.b, 2)
    })

    it("should reject modifying inline tables", function () {
      assert.throws(() => toml.from(`[product]\ntype = { name = "Nail" }\ntype.edible = false`))
      assert.throws(() => toml.from(`[product]\ntype.name = "Nail"\ntype = { edible = false }`))
    })
  })

  describe("Array of Tables", function () {
    it("should parse array of tables", function () {
      const data = toml.from(`
[[product]]
name = "Hammer"
sku = 738594937

[[product]]

[[product]]
name = "Nail"
sku = 284758393
color = "gray"
`).data as any
      assert.strictEqual(data.product.length, 3)
      assert.strictEqual(data.product[0].name, "Hammer")
      assert.strictEqual(data.product[0].sku, 738594937)
      assert.deepStrictEqual(data.product[1], {})
      assert.strictEqual(data.product[2].name, "Nail")
      assert.strictEqual(data.product[2].color, "gray")
    })

    it("should parse array of tables with sub-tables", function () {
      const data = toml.from(`
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
`).data as any
      assert.strictEqual(data.fruits.length, 2)
      assert.strictEqual(data.fruits[0].name, "apple")
      assert.strictEqual(data.fruits[0].physical.color, "red")
      assert.strictEqual(data.fruits[0].varieties.length, 2)
      assert.strictEqual(data.fruits[0].varieties[0].name, "red delicious")
      assert.strictEqual(data.fruits[1].name, "banana")
      assert.strictEqual(data.fruits[1].varieties[0].name, "plantain")
    })

    it("should reject invalid array of tables", function () {
      assert.throws(() => toml.from(`[fruit.physical]\ncolor = "red"\n[[fruit]]\nname = "apple"`))
      assert.throws(() =>
        toml.from(
          `[[fruits]]\nname = "apple"\n[[fruits.varieties]]\nname = "red"\n[fruits.varieties]\nname = "smith"`,
        ),
      )
      assert.throws(() =>
        toml.from(
          `[[fruits]]\nname = "apple"\n[fruits.physical]\ncolor = "red"\n[[fruits.physical]]\ncolor = "green"`,
        ),
      )
    })
  })

  describe("Compatibility", function () {
    it("should handle complex nested structures", function () {
      const data = toml.from(`
[a.b.c]
d = 1

[[a.b.c.e]]
f = 2

[[a.b.c.e]]
f = 3

[a.b]
g = 4
`).data as any
      assert.strictEqual(data.a.b.c.d, 1)
      assert.strictEqual(data.a.b.c.e.length, 2)
      assert.strictEqual(data.a.b.c.e[0].f, 2)
      assert.strictEqual(data.a.b.c.e[1].f, 3)
      assert.strictEqual(data.a.b.g, 4)
    })

    it("should preserve data types", function () {
      const data = toml.from(`str = "42"\nint = 42\nflt = 42.0`).data as any
      assert.strictEqual(typeof data.str, "string")
      assert.strictEqual(typeof data.int, "number")
      assert.strictEqual(typeof data.flt, "number")
      assert.strictEqual(data.str, "42")
      assert.strictEqual(data.int, 42)
      assert.strictEqual(data.flt, 42.0)
    })

    it("should handle all data types in one document", function () {
      const data = toml.from(`
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
`).data as any
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
