const ABSOLUTE_URL_PATTERN = /^(?:[a-z]+:)?\/\//i;

export function resolvePublicUrl(path: string) {
  const resolvedPath = path;

  if (!resolvedPath || ABSOLUTE_URL_PATTERN.test(resolvedPath) || resolvedPath.startsWith("data:")) {
    return resolvedPath;
  }

  if (resolvedPath.startsWith("/")) {
    return `${import.meta.env.BASE_URL}${resolvedPath.slice(1)}`;
  }

  return resolvedPath;
}
