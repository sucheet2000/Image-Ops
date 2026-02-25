export type OperationScope =
  | 'image.upload'
  | 'image.jobs.write'
  | 'image.jobs.read'
  | 'image.cleanup'
  | 'image.quota.read';

export type OperationDef = {
  operationId: string;
  method: 'GET' | 'POST';
  route: string;
  summary: string;
  keyInputFields: string[];
  scope: OperationScope;
  mutating: boolean;
};

export type SearchResult = Pick<
  OperationDef,
  'operationId' | 'method' | 'route' | 'summary' | 'keyInputFields'
>;

export type ExecuteStep = {
  operationId: string;
  params?: Record<string, unknown>;
};

export type ExecuteRequest = {
  steps: ExecuteStep[];
  idempotencyKey?: string;
  code?: string;
};

export type ExecuteResult = {
  operationId: string;
  status: number;
  body: unknown;
};

export type AccessTokenClaims = {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  scopes: string[];
};
