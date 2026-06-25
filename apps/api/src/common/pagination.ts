export interface PaginationQuery {
  page?: string;
  pageSize?: string;
  skip?: string;
  take?: string;
  limit?: string;
}

export interface PaginationOptions {
  defaultPageSize: number;
  maxPageSize: number;
}

export interface ParsedPagination {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const positiveInt = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
};

const nonNegativeInt = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : undefined;
};

export function parsePagination(
  query: PaginationQuery,
  options: PaginationOptions,
): ParsedPagination {
  const requestedSize =
    positiveInt(query.pageSize) ?? positiveInt(query.take) ?? positiveInt(query.limit);
  const pageSize = Math.min(
    requestedSize ?? options.defaultPageSize,
    options.maxPageSize,
  );
  const explicitSkip = nonNegativeInt(query.skip);
  const page =
    positiveInt(query.page) ??
    (explicitSkip !== undefined ? Math.floor(explicitSkip / pageSize) + 1 : 1);
  const skip = explicitSkip !== undefined && !query.page ? explicitSkip : (page - 1) * pageSize;

  return {
    page,
    pageSize,
    skip,
    take: pageSize,
  };
}

export function paginated<T>(
  items: T[],
  total: number,
  pagination: ParsedPagination,
): PaginatedResponse<T> {
  const pageCount = Math.ceil(total / pagination.pageSize);

  return {
    items,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
    pageCount,
    hasNextPage: pagination.skip + items.length < total,
    hasPreviousPage: pagination.skip > 0,
  };
}
