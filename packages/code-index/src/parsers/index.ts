import type { WorkspaceFileCandidate } from "../file-discovery.js";
import type { TypeScriptResolverConfig } from "../ts-resolver.js";
import { parseDartFile } from "./dart.js";
import { parseJavaFile } from "./java.js";
import { parseKotlinFile } from "./kotlin.js";
import { parsePhpFile } from "./php.js";
import { parsePythonFile } from "./python.js";
import { parseTypeScriptOrJavaScriptFile } from "./typescript.js";
import { EMPTY_SEMANTICS } from "./types.js";

export type { ParsedWorkspaceSemantics } from "./types.js";

export async function parseWorkspaceFileSemantics(input: {
  file: WorkspaceFileCandidate;
  filePathSet: Set<string>;
  projectImportId: string;
  workspacePath: string;
  resolverConfigs?: TypeScriptResolverConfig[];
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
    default:
      return { ...EMPTY_SEMANTICS };
  }
}
