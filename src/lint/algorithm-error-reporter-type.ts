export type Reporter = (lintingError: LintingError[], sourceText: string) => void;

export type LintingError = {
  ruleId: string;
  message: string;
  line: number;
  column: number;
  nodeType: string;
};
