declare module "language-map" {
  interface LanguageMapDefinition {
    type?: string;
    color?: string;
    extensions?: string[];
    aliases?: string[];
    filenames?: string[];
    interpreters?: string[];
    tmScope?: string;
    aceMode?: string;
    codemirrorMode?: string;
    codemirrorMimeType?: string;
    languageId?: number;
    group?: string;
  }

  const languageMap: Record<string, LanguageMapDefinition>;

  export default languageMap;
}
