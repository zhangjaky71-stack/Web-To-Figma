export const WTF_FILE_EXTENSION = ".wtf" as const;
export const WTF_MIME_TYPE = "application/x-wtf" as const;

export function isWtfFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(WTF_FILE_EXTENSION);
}
