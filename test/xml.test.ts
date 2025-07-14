import assert from "assert"
import { promises as fs } from "fs"
import { xml, StructuredData } from "../src/index.js"

const libraryXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<?process instruction?>
<!-- Main library data for 2025 -->
      
<library>
  <!-- First book entry -->
  <book id="b1" available="true">
    <title>XML &amp; Data Structures</title>
    <author><![CDATA[Seniru <Pasan>]]></author>
    <published year="2024" />
    <tags>
      <tag>education</tag>
      <tag>&lt;xml&gt;</tag>
      <tag>&#169; copyright</tag>
    </tags>
  </book>
      
  <!-- Second book entry -->
  <book id="b2" available="false">
    <title><![CDATA[Another Book & Notes]]></title>
    <author>Jane Doe</author>
    <published year="2023" />
  </book>
</library>`

describe("xml", () => {
  describe("loadFile", () => {
    before(async () => {
      // create file with valid xml
      await fs.writeFile("test.xml", libraryXml)
      // create file with invalid xml
      await fs.writeFile("invalid.xml", `<root><item><name>Test</name></item>`)
    })

    after(async () => {
      // clean up files
      await fs.unlink("test.xml")
      await fs.unlink("invalid.xml")
    })

    it("should create a StructuredData object with a valid xml file", async () => {
      const data = await xml.loadFile("test.xml")
      assert.ok(data instanceof StructuredData)
      // todo: better test cases once we are done with the data getter for xml
      assert.equal((data.data as Record<string, any>).library.books.length, 2)
      assert.strictEqual(data.originFormat, "xml")
    })

    it("should throw an error for a file with invalid xml", async () => {
      assert.rejects(async () => await xml.loadFile("invalid.xml"), {
        name: "SyntaxError",
        message: "Unexpected end of input",
      })
    })

    it("should throw an error if the file is not found", async () => {
      assert.rejects(async () => await xml.loadFile("nonexistent.xml"), {
        name: "Error",
        message: "ENOENT: no such file or directory, open 'nonexistent.xml'",
      })
    })
  })

  describe("from", () => {
    it("should create a StructuredData object with valid xml", async () => {
      const data = xml.from(libraryXml)

      assert.ok(data instanceof StructuredData)
    })

    it("should throw an error for invalid xml", () => {
      assert.throws(() => xml.from("<root><item>Invalid XML</item>"), {
        name: "SyntaxError",
        message: "Unexpected EOF",
      })
    })

    it("should throw an error for empty xml", () => {
      assert.throws(() => xml.from(""), {
        name: "SyntaxError",
        message: "Unexpected EOF",
      })
    })

    it("should throw an error for malformed xml", () => {
      assert.throws(() => xml.from("<root><item>Unclosed tag"), {
        name: "SyntaxError",
        message: "Unexpected EOF",
      })
    })

    it("should handle CDATA sections correctly", () => {
      const cdataXml = `<root><item><![CDATA[Some <unescaped> content]]></item></root>`
      const data = xml.from(cdataXml)

      assert.ok(data instanceof StructuredData)
      assert.strictEqual((data.data as Record<string, any>).root.item, "Some <unescaped> content")
    })

    it("should handle attributes with special characters", () => {
      const attrXml = `<root><item id="item1" name="Test &amp; Example">Content</item></root>`
      const data = xml.from(attrXml)
      assert.ok(data instanceof StructuredData)
      const item = (data.data as Record<string, any>).root.item
      assert.strictEqual(item.id, "item1")
      assert.strictEqual(item.name, "Test & Example")
      assert.strictEqual(item.$value, "Content")
    })

    it("should handle empty elements", () => {
      const emptyXml = `<root><item id="empty" /></root>`
      const data = xml.from(emptyXml)
      assert.ok(data instanceof StructuredData)
      const item = (data.data as Record<string, any>).root.item
      assert.strictEqual(item.id, "empty")
      assert.strictEqual(item.value, undefined) // Empty element should not have a value
    })

    it("should handle nested elements", () => {
      const nestedXml = `<root><parent><child>Content</child></parent></root>`
      const data = xml.from(nestedXml)
      assert.ok(data instanceof StructuredData)
      const parent = (data.data as Record<string, any>).root.parent
      assert.strictEqual(parent.child, "Content")
    })

    it("should handle elements with multiple attributes", () => {
      const multiAttrXml = `<root><item id="item1" name="Test" value="Example" /></root>`
      const data = xml.from(multiAttrXml)
      assert.ok(data instanceof StructuredData)
      const item = (data.data as Record<string, any>).root.item
      assert.strictEqual(item.id, "item1")
      assert.strictEqual(item.name, "Test")
      assert.strictEqual(item.value, "Example")
    })

    // this is more of a StrucuturedData test, I'll leave it here so we can copy paste it later
    /*
    it("it should group common items", () => {
      const groupedXml = `<root>
        <item>
          <name>Item 1</name>
          <value>Value 1</value>
        </item>
        <item>
          <name>Item 2</name>
          <value>Value 2</value>
        </item>
      </root>`
      const data = xml.from(groupedXml)
      assert.ok(data instanceof StructuredData)
      const items = (data.data as Record<string, any>).root.items
      assert.strictEqual(items.length, 2)
      assert.strictEqual(items[0].name, "Item 1")
      assert.strictEqual(items[0].value, "Value 1")
      assert.strictEqual(items[1].name, "Item 2")
      assert.strictEqual(items[1].value, "Value 2")
    })
    */
  })
})
