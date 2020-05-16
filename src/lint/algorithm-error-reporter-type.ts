export type Reporter = ({
  line,
  column,
  message,
}: {
  line: number;
  column: number;
  message: string;
}) => void;
