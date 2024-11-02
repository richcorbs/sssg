export type Asset = {
  dependents: Set<string>;
};

export type Layout = {
  name: string;
  dependents: Set<string>;
};

export type Page = {
  dependencies: Set<string>;
};

export type Snippet = {
  name: string;
  dependents: Set<string>;
};
