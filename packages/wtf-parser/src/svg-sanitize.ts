import { WtfParserError } from "./types.js";

const FORBIDDEN_ELEMENTS =
  /<\s*\/?\s*(?:script|foreignObject|iframe|object|embed|audio|video|style|link|meta|base)\b/i;
const EVENT_HANDLER = /\son[a-z0-9:_-]*\s*=/i;
const URL_ATTRIBUTE = /\b(?:href|xlink:href|src)\s*=/gi;
const QUOTED_URL_ATTRIBUTE = /\b(?:href|xlink:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const STYLE_ATTRIBUTE = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const QUOTED_ATTRIBUTE = /\b[a-z_:][a-z0-9:._-]*\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const SAFE_FRAGMENT = /^#[A-Za-z_][A-Za-z0-9:._-]*$/;
const URL_FUNCTION = /url\(\s*([^)]*?)\s*\)/gi;
const SAFE_URL_FUNCTION = /^['"]?#[A-Za-z_][A-Za-z0-9:._-]*['"]?$/;

function unsafe(path: string, message: string): never {
  throw new WtfParserError({ code: "WTF_PARSER_SVG_UNSAFE", path, message });
}

function stripComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/g, "");
}

function inspectUrlFunctions(value: string, path: string): void {
  URL_FUNCTION.lastIndex = 0;
  let match: RegExpExecArray | null;
  let count = 0;
  while ((match = URL_FUNCTION.exec(value)) !== null) {
    count += 1;
    const target = (match[1] ?? "").trim();
    if (!SAFE_URL_FUNCTION.test(target)) {
      unsafe(path, "SVG url() references may only target an in-document fragment id");
    }
  }
  if (/url\s*\(/i.test(value) && count === 0) {
    unsafe(path, "malformed SVG url() reference is forbidden");
  }
}

export function sanitizeSvgText(input: string, path = "$.svg"): string {
  const normalized = input.replace(/^\uFEFF/, "").trim();
  if (!normalized.startsWith("<")) unsafe(path, "SVG payload must be XML text");
  if (!/^<\s*svg\b/i.test(normalized)) unsafe(path, "SVG payload must have an <svg> root element");
  if (!/<\/\s*svg\s*>\s*$/i.test(normalized))
    unsafe(path, "SVG payload must close the root <svg> element");
  if (/<!DOCTYPE\b/i.test(normalized) || /<!ENTITY\b/i.test(normalized)) {
    unsafe(path, "DOCTYPE and ENTITY declarations are forbidden in imported SVG");
  }
  if (/<\?xml|<\?[a-z]/i.test(normalized) || /<!\[CDATA\[/i.test(normalized)) {
    unsafe(path, "processing instructions and CDATA are forbidden in imported SVG");
  }
  if (FORBIDDEN_ELEMENTS.test(normalized)) {
    unsafe(path, "SVG contains an executable or embedded-content element");
  }
  if (EVENT_HANDLER.test(normalized)) unsafe(path, "SVG event-handler attributes are forbidden");

  const urlAssignments = normalized.match(URL_ATTRIBUTE)?.length ?? 0;
  QUOTED_URL_ATTRIBUTE.lastIndex = 0;
  let safeUrlAssignments = 0;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = QUOTED_URL_ATTRIBUTE.exec(normalized)) !== null) {
    safeUrlAssignments += 1;
    const value = (urlMatch[1] ?? urlMatch[2] ?? "").trim();
    if (!SAFE_FRAGMENT.test(value)) {
      unsafe(path, "SVG href/src attributes may only reference an in-document fragment id");
    }
  }
  if (safeUrlAssignments !== urlAssignments) {
    unsafe(path, "SVG href/src attributes must use a quoted fragment-only value");
  }

  STYLE_ATTRIBUTE.lastIndex = 0;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = STYLE_ATTRIBUTE.exec(normalized)) !== null) {
    const value = styleMatch[1] ?? styleMatch[2] ?? "";
    if (
      /@import|expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:|https?\s*:|\/\//i.test(value)
    ) {
      unsafe(path, "SVG style attribute contains an external or executable reference");
    }
    inspectUrlFunctions(value, path);
  }

  QUOTED_ATTRIBUTE.lastIndex = 0;
  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = QUOTED_ATTRIBUTE.exec(normalized)) !== null) {
    const value = attributeMatch[1] ?? attributeMatch[2] ?? "";
    if (/url\s*\(/i.test(value)) inspectUrlFunctions(value, path);
  }

  const sanitized = stripComments(normalized);
  if (FORBIDDEN_ELEMENTS.test(sanitized) || EVENT_HANDLER.test(sanitized)) {
    unsafe(path, "SVG remained unsafe after sanitization");
  }
  return sanitized;
}

export function sanitizeSvgBytes(bytes: Uint8Array, path = "$.svg"): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    unsafe(path, "SVG payload must be valid UTF-8");
  }
  return sanitizeSvgText(text, path);
}
