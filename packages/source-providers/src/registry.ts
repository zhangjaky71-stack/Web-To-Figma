import { FileTabProvider } from "./file-tab-provider.js";
import { HttpPageProvider } from "./http-page-provider.js";
import type { FileTabInput, HttpPageInput, SourceCapability, SourceDescriptor } from "./types.js";
import { getUrlProtocol } from "./urls.js";

export interface TabSourceInput {
  url: string;
  title?: string;
  fileSchemeAccess: boolean;
}

export interface TabSourceResolution {
  capability: SourceCapability;
  descriptor?: SourceDescriptor;
}

const httpPageProvider = new HttpPageProvider();
const fileTabProvider = new FileTabProvider();

export function getTabSourceCapability(input: TabSourceInput): SourceCapability {
  const protocol = getUrlProtocol(input.url);
  if (protocol === "http:" || protocol === "https:") {
    const httpInput: HttpPageInput = {
      url: input.url,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    return httpPageProvider.getCapability(httpInput);
  }
  if (protocol === "file:") {
    const fileInput: FileTabInput = {
      url: input.url,
      fileSchemeAccess: input.fileSchemeAccess,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    return fileTabProvider.getCapability(fileInput);
  }
  return {
    provider: "http-page",
    supported: false,
    available: false,
    code: "unsupported-scheme",
    reason: `Active tab scheme ${protocol ?? "invalid URL"} is not supported by NODE-06 tab providers`,
  };
}

export function resolveTabSource(input: TabSourceInput): TabSourceResolution {
  const capability = getTabSourceCapability(input);
  if (!capability.available) return { capability };

  if (capability.provider === "file-tab") {
    const fileInput: FileTabInput = {
      url: input.url,
      fileSchemeAccess: input.fileSchemeAccess,
      ...(input.title === undefined ? {} : { title: input.title }),
    };
    return { capability, descriptor: fileTabProvider.open(fileInput) };
  }

  const httpInput: HttpPageInput = {
    url: input.url,
    ...(input.title === undefined ? {} : { title: input.title }),
  };
  return { capability, descriptor: httpPageProvider.open(httpInput) };
}
