export type Reporter = (lintingError: LintingError) => void;

// TODO rename
export type LintingError = {
  ruleId: string;
  message: string;
  line: number;
  column: number;
};
