import type { WorkspaceFileCandidate } from "../file-discovery.js";
import type { TypeScriptResolverConfig, WorkspacePackageMap } from "../ts-resolver.js";
import { parseDartFile } from "./dart.js";
import { parseJavaFile } from "./java.js";
import { parseKotlinFile } from "./kotlin.js";
import { parsePhpFile } from "./php.js";
import { parsePythonFile } from "./python.js";
import { parseTypeScriptOrJavaScriptFile } from "./typescript.js";
import { parseRustFile } from "./rust.js";
import { parseGoFile } from "./go.js";
import { parseCCppFile } from "./c-cpp.js";
import { parseCSharpFile } from "./csharp.js";
import { parseRubyFile } from "./ruby.js";
import { parseSwiftFile } from "./swift.js";
import { parseExtraLanguageFile } from "./extra-langs.js";
import { EMPTY_SEMANTICS } from "./types.js";

export type { ParsedWorkspaceSemantics } from "./types.js";

export async function parseWorkspaceFileSemantics(input: {
  file: WorkspaceFileCandidate;
  filePathSet: Set<string>;
  projectImportId: string;
  workspacePath: string;
  resolverConfigs?: TypeScriptResolverConfig[];
  workspacePackageMap?: WorkspacePackageMap;
}) {
  if (!input.file.language || !input.file.content) {
    return { ...EMPTY_SEMANTICS };
  }

  switch (input.file.language) {
    case "TypeScript":
    case "JavaScript":
      return parseTypeScriptOrJavaScriptFile(
        input.file,
        input.filePathSet,
        input.projectImportId,
        input.workspacePath,
        input.resolverConfigs ?? [],
        input.workspacePackageMap ?? {},
      );
    case "Dart":
      return parseDartFile(input.file, input.filePathSet, input.projectImportId);
    case "Java":
      return parseJavaFile(input.file, input.projectImportId);
    case "Kotlin":
      return parseKotlinFile(input.file, input.projectImportId);
    case "PHP":
      return parsePhpFile(input.file, input.projectImportId);
    case "Python":
      return parsePythonFile(input.file, input.filePathSet, input.projectImportId);
    case "Rust":
      return parseRustFile(input.file, input.filePathSet, input.projectImportId);
    case "Go":
      return parseGoFile(input.file, input.filePathSet, input.projectImportId);
    case "C":
    case "C++":
      return parseCCppFile(input.file, input.filePathSet, input.projectImportId);
    case "C#":
      return parseCSharpFile(input.file, input.projectImportId);
    case "Ruby":
      return parseRubyFile(input.file, input.filePathSet, input.projectImportId);
    case "Swift":
      return parseSwiftFile(input.file, input.projectImportId);
    case "Scala":
    case "Elixir":
    case "Lua":
    case "Zig":
      return parseExtraLanguageFile(input.file, input.projectImportId);
    default:
      return { ...EMPTY_SEMANTICS };
  }
}
