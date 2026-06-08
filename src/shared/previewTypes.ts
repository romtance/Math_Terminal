export type TexDelimiter = 'dollar-dollar' | 'bracket';

export type TexBlock = {
  id: string;
  delimiter: TexDelimiter;
  source: string;
};

export type RenderedPreviewBlock = TexBlock & {
  html: string;
  error?: string;
};
