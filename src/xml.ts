import { promises as fs, PathLike } from "fs"
import DataFormat from "./types/DataFormat"
import StructuredData from "./StructuredData.js"
import { replaceHTMLEntities } from "./utils/common.js"

// https://www.w3.org/TR/xml/
// https://xmlbeans.apache.org/docs/2.0.0/guide/conUnderstandingXMLTokens.html
type TokenType =
  | "COMMENT"
  | "CDATA"
  | "PROCINST"
  | "DOCTYPE_DECL"
  | "STAG"
  | "ETAG"
  | "EMPTY_ELEM_TAG"
  | "ATTR_NAME"
  | "ATTR_VALUE"
  | "TEXT"

interface Token {
  type: TokenType
  value: string
}

interface Node {
  parent: Node | null
  children: Node[]
  key: string
  value: string
  attributes: Record<string, string>
}

const _consumeUntil = (
  str: string,
  chars: string[],
  i: number,
  n: number,
): [value: string, i: number] => {
  let value = ""
  let lookForCharLength = chars[0].length
  let isLookingForSingleCharacter = lookForCharLength == 1
  while (i < n) {
    // some minor optimizations to avoid calling substring
    const c = str[i]
    const currentSearch = isLookingForSingleCharacter ? c : str.substring(i, i + lookForCharLength)
    if (chars.includes(currentSearch)) {
      return [value, i]
    } else {
      value += c
      i++
    }
  }
  throw new SyntaxError("Unexpected EOF")
}

const _processProcInst = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  let [value, newIndex] = _consumeUntil(str, ["?"], i, n)
  i = newIndex

  const nextChar = str[i + 1]
  if (nextChar == ">") {
    const token = {
      type: "PROCINST",
      value,
    } as Token
    return [token, i + 1, true]
  } else {
    throw new SyntaxError(`Expected > at ${i + 1}, instead found ${nextChar}`)
  }
}

const _processStartTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  let [value, newIndex] = _consumeUntil(str, [" ", ">"], i, n)
  i = newIndex
  const token = {
    type: "STAG",
    value,
  } as Token
  return [token, i, str[i] == " "]
}

const _processEndTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  let [value, newIndex] = _consumeUntil(str, [">"], i, n)
  i = newIndex
  const token = {
    type: "ETAG",
    value,
  } as Token
  return [token, i, true]
}

const _processEmptyElementTag = (str: string, i: number): [Token, i: number] => {
  const nextChar = str[i + 1]
  if (nextChar == ">") {
    const token = {
      type: "EMPTY_ELEM_TAG",
      value: "",
    } as Token
    return [token, i + 1]
  } else throw new SyntaxError(`Unexpected symbol ${nextChar} at ${i + 1}. Expected >`)
}

const _processDoctype = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, [">"], i, n)
  i = newIndex
  const token = {
    type: "DOCTYPE_DECL",
    value,
  } as Token
  return [token, i, true]
}

const _processCData = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, ["]]>"], i, n)
  i = newIndex
  const token = {
    type: "CDATA",
    value,
  } as Token
  return [token, i + 2, true]
}

const _processComment = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  const [value, newIndex] = _consumeUntil(str, ["-->"], i, n)
  i = newIndex
  const token = {
    type: "COMMENT",
    value,
  } as Token
  return [token, i + 2, true]
}

const _processOpenTag = (
  str: string,
  i: number,
  n: number,
): [Token, i: number, canCloseTag: boolean] => {
  if (++i >= n) throw new SyntaxError("Unexpected EOF")
  const c = str[i]

  if (c == "?") {
    return _processProcInst(str, i, n)
  } else if (c == "/") {
    return _processEndTag(str, i, n)
  } else if (c == "!") {
    if (str.startsWith("!--", i)) return _processComment(str, i + 3, n)
    else if (str.startsWith("!DOCTYPE ", i)) return _processDoctype(str, i + 9, n)
    else if (str.startsWith("![CDATA[", i)) return _processCData(str, i + 8, n)
    else throw new SyntaxError(`Unexpected symbol ! at ${i}`)
  } else {
    // starting tag
    return _processStartTag(str, i, n)
  }
}

const _processAttribute = (str: string, i: number, n: number): [Token, i: number] => {
  let c = str[i]

  /* prettier-ignore */
  const isAttributeValue = c == "\""
  /* prettier-ignore */
  const endCharacter = isAttributeValue ? "\"" : "="

  if (isAttributeValue) i++

  let [value, newIndex] = _consumeUntil(str, [endCharacter], i, n)
  i = newIndex
  const token = {
    type: isAttributeValue ? "ATTR_VALUE" : "ATTR_NAME",
    value,
  } as Token
  return [token, i]
}

const _processText = (str: string, i: number, n: number): [Token, i: number] => {
  let [value, newIndex] = _consumeUntil(str, ["<"], i, n)
  i = newIndex
  const token = {
    type: "TEXT",
    value,
  } as Token
  return [token, i - 1]
}

const tokenize = (str: string): Token[] => {
  const tokens = [] as Token[]
  const n = str.length
  let i = 0
  let tagOpen = false

  while (i < n) {
    const c = str[i]

    if (c == "<") {
      tagOpen = true
      const [token, newIndex, canCloseTag] = _processOpenTag(str, i, n)
      i = newIndex
      tagOpen = canCloseTag
      tokens.push(token)
    } else if (c == ">") {
      if (tagOpen) tagOpen = false
      else throw new SyntaxError(`Unexpected symbol > at ${i}`)
    } else if (c == "/") {
      // expecting a self closing tag
      const [token, newIndex] = _processEmptyElementTag(str, i)
      i = newIndex
      tokens.push(token)
    } else if (c == "\n" || c == "\t" || c == " ") {
      i++
      continue
    } else {
      let token: Token

      if (tagOpen) {
        // if tag is opened, it must be an attribute
        ;[token, i] = _processAttribute(str, i, n)
      } else {
        // if tag is closed, it must be text
        ;[token, i] = _processText(str, i, n)
      }
      tokens.push(token)
    }
    i++
  }

  return tokens
}

const _constructObject = (root: Node): string | Record<string, any> => {
  // recursively construct sub nodes
  // base case for the recursive function
  if (root.children.length === 0) {
    // if there are no attributes just return the value
    if (Object.keys(root.attributes).length === 0) return root.value
    else {
      return {
        ...root.attributes,
        $value: root.value,
      }
    }
  } else {
    let children = [] as any[]
    for (let child of root.children) {
      let constructed = _constructObject(child)
      if (Object.keys(child.attributes).length === 0) children.push({ [child.key]: constructed })
      else {
        switch (typeof constructed) {
          case "string":
            children.push({ [child.key]: { ...child.attributes, $value: constructed } })
            break
          case "object":
            if (Array.isArray(constructed)) {
              constructed.push(...Object.entries(child.attributes).map(([k, v]) => ({ [k]: v })))
              children.push({ [child.key]: constructed })
            } else children.push({ [child.key]: { ...child.attributes, ...constructed } })
            break
        }
      }
    }
    return children
  }
}

const parse = (str: string): Record<string, any> => {
  const tokens = tokenize(str)
  const root = {
    parent: null,
    children: [] as Node[],
    attributes: {},
  } as Node
  // to check if the tags are balanced
  let depth = 1

  let currentNode = root
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    let token = tokens[tokenIndex]

    if (token.type === "STAG") {
      if (currentNode === root && !root.key) root.key = token.value
      else {
        let newNode = {
          parent: currentNode,
          children: [] as Node[],
          key: token.value,
          attributes: {},
        } as Node
        currentNode.children.push(newNode)
        currentNode = newNode
        depth++
      }
    } else if (token.type === "ETAG" || token.type == "EMPTY_ELEM_TAG") {
      if (currentNode.parent) currentNode = currentNode.parent
      depth--
    } else if (token.type === "TEXT") {
      currentNode.value = replaceHTMLEntities(token.value)
    } else if (token.type === "ATTR_NAME") {
      let nextToken = tokens[++tokenIndex]
      if (nextToken.type !== "ATTR_VALUE")
        throw new SyntaxError("Expected attribute value after attribute name.")
      currentNode.attributes[token.value] = replaceHTMLEntities(nextToken.value)
    } else if (token.type === "CDATA") {
      currentNode.value = token.value
    }
  }

  // if the currentNode doesn't match the root, the tags are not balanced
  if (depth !== 0 || currentNode !== root) throw new SyntaxError("Unexpected EOF")

  return { [root.key]: _constructObject(root) }
}

const xml: DataFormat = {
  loadFile: async function (path: PathLike | fs.FileHandle): Promise<StructuredData> {
    const text = (await fs.readFile(path)).toString()
    return xml.from(text)
  },

  from: function (text: string): StructuredData {
    const parsed = parse(text)
    return new StructuredData(parsed, "xml")
  },
}

export default xml
