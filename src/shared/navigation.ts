export type NavigationTarget = {
  input: string;
  url: string;
  type: "url" | "search";
};

export function resolveNavigationInput(rawInput: string): NavigationTarget {
  const input = rawInput.trim();
  if (!input) throw new Error("Enter a URL or search first.");

  if (hasExplicitScheme(input)) {
    return { input, url: input, type: "url" };
  }

  if (isLocalAddress(input)) {
    return { input, url: `http://${input}`, type: "url" };
  }

  if (looksLikeUrl(input)) {
    return { input, url: `https://${input}`, type: "url" };
  }

  return {
    input,
    url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
    type: "search",
  };
}

function hasExplicitScheme(input: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(input);
}

function isLocalAddress(input: string) {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)(:\d+)?(\/.*)?$/i.test(input);
}

function looksLikeUrl(input: string) {
  if (/\s/.test(input)) return false;
  if (/^[\w.-]+:\d+(\/.*)?$/i.test(input)) return true;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/i.test(input)) return true;
  return false;
}
