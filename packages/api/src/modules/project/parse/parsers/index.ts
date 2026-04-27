import type { WorkspaceFileCandidate } from "../file-discovery";
import type { TypeScriptResolverConfig } from "../ts-resolver";
import { parseDartFile } from "./dart";
import { parsePhpFile } from "./php";
import { parsePythonFile } from "./python";
import { parseTypeScriptOrJavaScriptFile } from "./typescript";
import { EMPTY_SEMANTICS } from "./types";

export type { ParsedWorkspaceSemantics } from "./types";

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
    case "PHP":
      return parsePhpFile(input.file, input.projectImportId);
    case "Python":
      return parsePythonFile(input.file, input.filePathSet, input.projectImportId);
    default:
      return { ...EMPTY_SEMANTICS };
  }
}
